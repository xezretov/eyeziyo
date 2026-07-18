/**
 * Standalone transcription tester — mirrors gemini.ts logic without the worker.
 *
 * Usage:
 *   node test-transcribe.js <wav-path> [--mode=single|chunked] [--limit=N]
 *                            [--course="..."] [--topic="..."] [--out=transcript.txt]
 *
 * Modes:
 *   single   — send the whole WAV to Gemini in one call (fast, simple)
 *   chunked  — split into 12-sec chunks with 0.5-sec overlap, dedup like worker (default)
 *
 * GEMINI_API_KEY: read from env var, or pass via --key=... flag.
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const audioPath = args.find((a) => !a.startsWith("--"));
const getFlag = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : def;
};
const mode = getFlag("mode", "chunked");
const limit = parseInt(getFlag("limit", "0")) || Infinity;
const courseType = getFlag("course", "Backend dasturlash");
const topic = getFlag("topic", "");
const outFile = getFlag("out", "");
const API_KEY = getFlag("key", process.env.GEMINI_API_KEY || "");
const modelFlag = getFlag("model", "");
const monoFlag = getFlag("mono", "1") !== "0"; // downmix stereo->mono (default on)
// Free-tier pacing: gemini-2.5-flash ~10 RPM, flash-lite ~15 RPM. Default to a
// safe gap; --delay=ms overrides. --retries handles transient 429/503.
const delayMs = parseInt(getFlag("delay", "6500")) || 6500;
const maxRetries = parseInt(getFlag("retries", "4"));
const useGlossary = getFlag("glossary", "0") === "1"; // auto-generate from course+topic

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!audioPath || !fs.existsSync(audioPath)) {
  console.error("Usage: node test-transcribe.js <wav-path> [--mode=single|chunked] [--limit=N]");
  console.error("Audio fayl topilmadi:", audioPath);
  process.exit(1);
}
if (!API_KEY) {
  console.error("GEMINI_API_KEY topilmadi. --key=... yoki env var orqali bering.");
  process.exit(1);
}

// Default fallback chain; --model=... pins a single model (e.g. the "medium"
// gemini-2.5-flash) and disables fallback so the test reflects that one model.
const MODELS = modelFlag ? [modelFlag] : ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
const HALLUCINATION_CHAR_CAP = 1200; // 12s * 50 chars/sec * 2 safety

// ─── WAV parsing ─────────────────────────────────────────────
function parseWav(buf) {
  if (buf.slice(0, 4).toString() !== "RIFF") throw new Error("Not a RIFF file");
  if (buf.slice(8, 12).toString() !== "WAVE") throw new Error("Not a WAVE file");

  let offset = 12;
  let numChannels = 0, sampleRate = 0, bitsPerSample = 0, audioFormat = 0;
  let dataOffset = 0, dataSize = 0;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.slice(offset, offset + 4).toString();
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      audioFormat = buf.readUInt16LE(offset + 8);
      numChannels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (!dataOffset) throw new Error("data chunk topilmadi");
  return { audioFormat, numChannels, sampleRate, bitsPerSample, dataOffset, dataSize };
}

function makeWav(pcmBuf, sampleRate, numChannels, bitsPerSample) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuf.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuf.length, 40);
  return Buffer.concat([header, pcmBuf]);
}

// ─── PCM normalization: -> 16-bit, optional mono, resample to 16 kHz ──
// Gemini STT is optimised for 16 kHz 16-bit mono. Measured: just resampling
// 48 kHz -> 16 kHz fixed a "XIV asr" -> "19-asr" mishearing and improved
// proper-noun accuracy more than any denoise filter. Production (Android)
// already records at 16 kHz; this brings arbitrary test WAVs in line.
const TARGET_RATE = 16000;

// Linear-interpolation resampler for an int16 mono buffer.
function resample16(int16, srcRate, dstRate) {
  if (srcRate === dstRate) return int16;
  const srcLen = int16.length / 2;
  const dstLen = Math.floor((srcLen * dstRate) / srcRate);
  const out = Buffer.alloc(dstLen * 2);
  const ratio = srcRate / dstRate;
  for (let i = 0; i < dstLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, srcLen - 1);
    const frac = pos - i0;
    const s = int16.readInt16LE(i0 * 2) * (1 - frac) + int16.readInt16LE(i1 * 2) * frac;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s))), i * 2);
  }
  return out;
}

// Gemini STT works best on 16-bit PCM. Many recorders emit 32-bit; feeding
// that raw hurts accuracy. Convert to int16 and (by default) downmix to mono.
function normalizePcm(pcm, srcBits, srcChannels, toMono) {
  const bytesPerSample = srcBits / 8;
  const frameCount = Math.floor(pcm.length / (bytesPerSample * srcChannels));
  const outChannels = toMono ? 1 : srcChannels;
  const out = Buffer.alloc(frameCount * outChannels * 2); // int16 out

  const readSample = (i) => {
    const off = i * bytesPerSample;
    if (srcBits === 16) return pcm.readInt16LE(off);
    if (srcBits === 32) return pcm.readInt32LE(off) >> 16; // 32->16
    if (srcBits === 8) return (pcm.readUInt8(off) - 128) << 8; // 8-bit unsigned
    if (srcBits === 24) {
      const b0 = pcm[off], b1 = pcm[off + 1], b2 = pcm[off + 2];
      let v = (b2 << 16) | (b1 << 8) | b0;
      if (v & 0x800000) v -= 0x1000000;
      return v >> 8; // 24->16
    }
    return 0;
  };

  let o = 0;
  for (let f = 0; f < frameCount; f++) {
    if (toMono) {
      let sum = 0;
      for (let c = 0; c < srcChannels; c++) sum += readSample(f * srcChannels + c);
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / srcChannels))), o);
      o += 2;
    } else {
      for (let c = 0; c < srcChannels; c++) {
        out.writeInt16LE(Math.max(-32768, Math.min(32767, readSample(f * srcChannels + c))), o);
        o += 2;
      }
    }
  }
  return { pcm: out, channels: outChannels, bits: 16 };
}

// ─── Prompt + cleaning (ported from gemini.ts) ────────────────
function buildInstruction(courseType, topic, prevTail = "", glossary = "") {
  const tail = (prevTail || "").trim().slice(-200);
  const contextBlock = tail
    ? `\nOLDINGI GAP OXIRI (faqat kontekst uchun, BU MATNNI QAYTARMA):\n"${tail}"\n\nHozirgi audio shu gapning davomi bo'lishi mumkin. Faqat YANGI eshitilgan so'zlarni yoz.\n`
    : "";

  const glossaryBlock = glossary
    ? `\nMAVZU LUG'ATI (atoqli otlar, joy va shaxs nomlari, atamalar — shu darsda uchrashi MUMKIN):\n${glossary}\n\nQOIDA: Agar audioda shu lug'atdagi so'zga o'xshash narsa eshitsang, uni AYNAN lug'atdagi ko'rinishda yoz (masalan "Movarounnaxr/Borinaxr" eshitilsa → "Movarounnahr"). Lekin lug'atdagi so'zni audioda YO'Q bo'lsa, ZO'RAKI kiritma — faqat haqiqatan eshitilganini yoz.\n`
    : "";

  return `Sen ovozli nutqni matnga o'giruvchi transkriberisan. Sen REDAKTOR EMASSAN, faqat eshitgan narsangni yozasan.
${glossaryBlock}

Kontekst: ${courseType || "umumiy ta'lim"}${topic ? ` darsi, mavzu: ${topic}` : ""}
${contextBlock}
VAZIFA: Audioyozuvdagi o'zbek tilidagi nutqni SO'ZMA-SO'Z, aynan eshitganingdek yoz.

QAT'IY QOIDALAR:

1. VAQT MARKERLARI YO'Q
   - Hech qachon "00:00", "00:05", "[00:01]" kabi vaqt belgilarini qo'shma.
   - Audio metadata, duration, timestamps — ularni matnga kiritma.

2. HECH NIMA O'YLAB TOPMA
   - Agar so'z aniq eshitilmasa, umuman yozma yoki "[...]" deb qoldir.
   - Hech qachon bo'sh joyni "mos" so'z bilan to'ldirma.
   - Agar gap yarim kesilgan bo'lsa, kesilgan holda yoz — davom ettirma.
   - Qayta takrorlama (masalan "1995-yil JavaScript 2000-yillarda" — bunday ikki yil takrori YO'Q).
   - Mavzuga mos deb darslik abzatslarini qo'shma.
   - Bitta gapni ikki-uch marta takrorlama. Agar loop'ga tushsang — darhol to'xta.

3. NOMLARNI VA XORIJIY SO'ZLARNI SAQLA
   - Brend va loyiha nomlarini asl holida yoz: UzbekDevs, GitHub, Node.js, React Native, MDN.
   - Agar "Hello World" desa — "Hello World" deb yoz, "xello" qilma.
   - Inglizcha atamalarni asl holida yoz: console.log, backend, frontend, HTML, CSS, SQL, API, JSON, PHP, Python, MySQL.

4. TALAFFUZ XATOLARI
   - Faqat o'zbek tilidagi aniq transliteratsiya xatolarini tuzat: payton→Python, vekent→backend, esskyuel→SQL, jeyeson→JSON, dzhava skript→JavaScript.
   - Notanish so'zlarni taxmin qilma — agar eshitilmagan bo'lsa, tashlab ket.

5. METAFORA VA TARKIBLI GAPLAR
   - O'qituvchining metaforalarini o'zgartirma: "tiriltirish" "trend qilish" emas.
   - Gap strukturasini sodda qilma — uzun gaplarni bo'lmasdan yoz.

6. FORMAT
   - Faqat toza matn: nuqta, vergul, savol belgisi.
   - Markdown YO'Q, code block YO'Q, izoh YO'Q.
   - Hech qachon "Sen ...", "Kontekst:", "VAZIFA:" kabi instruksiya parchalarini qaytarma.

7. SHOVQIN / JIMLIK
   - Agar nutq yo'q yoki faqat shovqin bo'lsa — bo'sh satr qaytar.

Faqat transkriptni qaytar, boshqa hech narsa qo'shma.`;
}

function stripTimestamps(text) {
  if (!text) return text;
  return text
    .replace(/\[?\b\d{1,2}:\d{2}(?::\d{2})?\]?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^\s+|\s+$/g, "");
}

function isPromptLeak(text) {
  const head = text.slice(0, 200).toLowerCase();
  const signatures = [
    /^\s*sen\s+(ovozli|redaktor|transkriber)/,
    /^\s*kontekst\s*:/,
    /^\s*vazifa\s*:/,
    /^\s*qat['']?iy\s+qoidalar/,
    /^\s*oldingi\s+gap\s+oxiri/,
    /^\s*audioyozuvdagi/,
    /^\s*faqat\s+transkriptni\s+qaytar/,
  ];
  return signatures.some((re) => re.test(head));
}

function truncateRepetitionOnce(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 18) return text;
  const maxLen = Math.min(60, Math.floor(words.length / 3));
  for (let phraseLen = 6; phraseLen <= maxLen; phraseLen++) {
    for (let start = 0; start + phraseLen * 3 <= words.length; start++) {
      const phrase = words.slice(start, start + phraseLen).join(" ");
      let count = 1;
      let pos = start + phraseLen;
      while (
        pos + phraseLen <= words.length &&
        words.slice(pos, pos + phraseLen).join(" ") === phrase
      ) {
        count++;
        pos += phraseLen;
      }
      if (count >= 3) {
        const kept = words.slice(0, start + phraseLen).join(" ");
        const tailWords = words.slice(pos);
        const partial =
          tailWords.length < phraseLen && phrase.startsWith(tailWords.join(" "));
        return partial || tailWords.length === 0
          ? kept
          : kept + " " + tailWords.join(" ");
      }
    }
  }
  return text;
}

function truncateRepetition(text) {
  let cur = text;
  for (let i = 0; i < 8; i++) {
    const next = truncateRepetitionOnce(cur);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

function cleanTranscriptChunk(text) {
  if (!text) return "";
  const stripped = stripTimestamps(text);
  if (!stripped) return "";
  if (isPromptLeak(stripped)) return "";
  return truncateRepetition(stripped);
}

// ─── Gemini call ─────────────────────────────────────────────
async function callGeminiAudio(audioBuf, instruction, maxTokens) {
  const audioBase64 = audioBuf.toString("base64");
  const payload = {
    contents: [
      {
        parts: [
          { text: instruction },
          { inline_data: { mime_type: "audio/wav", data: audioBase64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.0, maxOutputTokens: maxTokens },
  };
  const body = JSON.stringify(payload);

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    // Retry transient 429 (rate limit) / 503 (overloaded) with exponential
    // backoff before falling through to the next model in the chain.
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
          body,
        });
        if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
          const wait = Math.min(60000, 4000 * Math.pow(2, attempt)); // 4s,8s,16s,32s
          process.stdout.write(`[${res.status} retry ${attempt + 1}/${maxRetries} in ${wait / 1000}s] `);
          await sleep(wait);
          continue;
        }
        if (res.status === 429) {
          console.log(`  [${model}] 429 quota exhausted, trying next...`);
          break; // next model
        }
        if (!res.ok) {
          const t = await res.text();
          console.log(`  [${model}] ${res.status}: ${t.slice(0, 200)}`);
          break; // next model
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        return { model, text };
      } catch (e) {
        console.log(`  [${model}] error: ${e.message}`);
        break;
      }
    }
  }
  return { model: null, text: "" };
}

async function callGeminiText(prompt, maxTokens) {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    // gemini-2.5-flash is a thinking model — without disabling it, reasoning
    // tokens eat the output budget and JSON responses get truncated
    // (finishReason: MAX_TOKENS). These list/edit tasks don't need CoT.
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const body = JSON.stringify(payload);
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
          body,
        }
      );
      if (res.status === 429 || !res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (text) return { model, text };
    } catch {}
  }
  return { model: null, text: "" };
}

// ─── Glossary generation (course+topic ONLY, no ground truth) ─
// Mirrors gemini.ts generateLessonTerms: from just the subject+topic, ask the
// model for the proper nouns / terms likely to appear. This is what production
// would have — no access to the lesson's actual transcript.
async function generateGlossary(courseType, topic) {
  const prompt = `Sen speech-to-text aniqligini oshirish uchun lug'at tuzuvchisan.

KURS: ${courseType}
MAVZU: ${topic}

Shu mavzudagi darsda o'qituvchi aytishi ehtimoli yuqori bo'lgan ATOQLI OTLAR (shaxs, joy, sulola nomlari), tarixiy atamalar va sanalarni ro'yxatla. Ayniqsa transkriberga qiyin bo'ladigan o'ziga xos nomlarga e'tibor ber.

JAVOB FAQAT JSON, FAQAT so'zlar ro'yxati (tavsif YO'Q, object YO'Q), 30-50 ta element:
{"terms": ["Movarounnahr", "Tug'luq Temur", "Sarbadorlar"]}`;

  const { text } = await callGeminiText(prompt, 2048);
  if (!text) return "";
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:\w+)?\s*/, "").replace(/`+$/, "").trim();
    }
    const data = JSON.parse(cleaned);
    const terms = (data.terms || []).map((t) => String(t).trim()).filter(Boolean);
    return [...new Set(terms)].slice(0, 60).join(", ");
  } catch {
    return "";
  }
}

// ─── Polish (ported from gemini.ts) ──────────────────────────
async function polishTranscript(raw, courseType, topic) {
  const trimmed = raw.trim();
  if (trimmed.length < 80) return trimmed;
  const deduped = truncateRepetition(trimmed);

  const prompt = `Sen transkriptsiya tahrirchisisan. Quyidagi matnni FAQAT quyidagi chegarada tuzat.

KURS: ${courseType || "umumiy"}
MAVZU: ${topic || "—"}

RUXSAT ETILGAN:
1. Ketma-ket takrorlangan bir xil gap yoki iborani olib tashla.
2. Tinish belgilari (nuqta, vergul, savol), bosh harflarni to'g'rila.
3. Juda aniq imlo xatolarini tuzat.

QAT'IY TAQIQ:
- YANGI gap, yangi abzats, yangi mavzu QO'SHMA.
- Parafraz qilma — so'zlarni almashtirma.
- Tarjima qilma.
- Agar biror gap tushunarsiz yoki yarim kesilgan bo'lsa — shundayligicha qoldir.
- Matn uzunligini sezilarli darajada oshirma.
- Markdown, izoh, sarlavha qo'shma.

ORIGINAL TRANSKRIPT:
${deduped}

TUZATILGAN TRANSKRIPT (faqat toza matn):`;

  const maxTokens = Math.min(8000, Math.max(512, Math.ceil(deduped.length / 2)));
  const { text } = await callGeminiText(prompt, maxTokens);
  const cleaned = text.trim();
  if (!cleaned) return deduped;
  if (cleaned.length > trimmed.length * 1.2) return deduped;
  if (cleaned.length < Math.max(40, deduped.length * 0.15)) return deduped;
  return cleaned;
}

// ─── Main ────────────────────────────────────────────────────
(async () => {
  const buf = fs.readFileSync(audioPath);
  const wav = parseWav(buf);
  const bytesPerSec = (wav.sampleRate * wav.numChannels * wav.bitsPerSample) / 8;
  const duration = wav.dataSize / bytesPerSec;

  console.log("════════════════════════════════════════════");
  console.log(" Audio:", audioPath);
  console.log(" Size :", (buf.length / 1024 / 1024).toFixed(2), "MB");
  console.log(" Dur  :", duration.toFixed(1), "s  (", (duration / 60).toFixed(2), "min)");
  console.log(" Fmt  :", wav.sampleRate, "Hz,", wav.numChannels, "ch,", wav.bitsPerSample, "bit, format =", wav.audioFormat);
  console.log(" Mode :", mode);
  console.log(" Course:", courseType, "| Topic:", topic || "(none)");
  console.log("════════════════════════════════════════════\n");

  if (wav.audioFormat !== 1) {
    console.warn("⚠️  Audio format is not PCM (got format=" + wav.audioFormat + "). Gemini may still accept it for single-shot, but chunked mode needs PCM.");
  }

  // Generate the proper-noun glossary from course+topic ONLY (no ground truth).
  let glossary = "";
  if (useGlossary) {
    process.stdout.write("Lug'at generatsiya qilinmoqda (kurs+mavzudan)... ");
    glossary = await generateGlossary(courseType, topic);
    console.log(glossary ? `${glossary.split(",").length} ta term` : "(bo'sh)");
    if (glossary) console.log("  " + glossary + "\n");
  }

  if (mode === "single") {
    console.log("Sending full audio to Gemini (single shot)...\n");
    const t0 = Date.now();
    const { model, text } = await callGeminiAudio(buf, buildInstruction(courseType, topic, "", glossary), 16000);
    console.log(`Model: ${model || "FAILED"}  |  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    console.log("─── RAW ───");
    console.log(text || "(empty)");
    console.log("\n─── CLEANED ───");
    const cleaned = cleanTranscriptChunk(text);
    console.log(cleaned);

    if (cleaned.length >= 80) {
      console.log("\n─── POLISHED ───");
      const polished = await polishTranscript(cleaned, courseType, topic);
      console.log(polished);
      if (outFile) fs.writeFileSync(outFile, polished);
    } else if (outFile) {
      fs.writeFileSync(outFile, cleaned);
    }
    if (outFile) console.log("\n→ Saved to", outFile);
    return;
  }

  // Chunked mode
  if (wav.audioFormat !== 1) {
    console.error("Chunked mode requires PCM WAV. Run with --mode=single or convert the file.");
    process.exit(1);
  }
  const CHUNK_SEC = 12;
  const OVERLAP_SEC = 0.5;

  // Normalize to 16-bit mono, then resample to 16 kHz for best Gemini accuracy.
  const rawPcm = buf.slice(wav.dataOffset, wav.dataOffset + wav.dataSize);
  const norm = (wav.bitsPerSample !== 16 || (monoFlag && wav.numChannels > 1))
    ? normalizePcm(rawPcm, wav.bitsPerSample, wav.numChannels, monoFlag)
    : { pcm: rawPcm, channels: wav.numChannels, bits: 16 };
  const effChannels = norm.channels;
  const effBits = norm.bits;
  // Resampling needs mono int16; only applied when we downmixed to 1 channel.
  let pcm = norm.pcm;
  let effRate = wav.sampleRate;
  if (effChannels === 1 && wav.sampleRate !== TARGET_RATE) {
    pcm = resample16(norm.pcm, wav.sampleRate, TARGET_RATE);
    effRate = TARGET_RATE;
  }
  const effBytesPerSec = (effRate * effChannels * effBits) / 8;
  if (norm.pcm !== rawPcm || effRate !== wav.sampleRate) {
    console.log(`Normalized: ${wav.bitsPerSample}bit/${wav.numChannels}ch/${wav.sampleRate}Hz -> ${effBits}bit/${effChannels}ch/${effRate}Hz\n`);
  }

  const chunkBytes = Math.floor(CHUNK_SEC * effBytesPerSec);
  const overlapBytes = Math.floor(OVERLAP_SEC * effBytesPerSec);
  const step = chunkBytes - overlapBytes;
  const totalChunks = Math.ceil(pcm.length / step);
  const numChunks = Math.min(totalChunks, limit);

  console.log(`Chunks: ${numChunks} of ${totalChunks} (${CHUNK_SEC}s each, ${OVERLAP_SEC}s overlap)\n`);

  let transcript = "";
  let okChunks = 0, emptyChunks = 0, failedChunks = 0;

  for (let i = 0; i < numChunks; i++) {
    const start = i * step;
    const end = Math.min(start + chunkBytes, pcm.length);
    const chunkPcm = pcm.slice(start, end);
    const chunkWav = makeWav(chunkPcm, effRate, effChannels, effBits);

    const startSec = (start / effBytesPerSec).toFixed(1);
    const endSec = (end / effBytesPerSec).toFixed(1);
    process.stdout.write(`[${(i + 1).toString().padStart(2, " ")}/${numChunks}] ${startSec}s–${endSec}s ... `);

    const t0 = Date.now();
    const { model, text } = await callGeminiAudio(
      chunkWav,
      buildInstruction(courseType, topic, transcript.slice(-200), glossary),
      600
    );
    const ms = Date.now() - t0;

    if (!model) {
      console.log(`FAILED (${ms}ms)`);
      failedChunks++;
      continue;
    }
    if (!text.trim()) {
      console.log(`empty (${model}, ${ms}ms)`);
      emptyChunks++;
      continue;
    }

    // Hallucination guard: drop chunks that returned far more text than the
    // audio can physically contain.
    if (text.length > HALLUCINATION_CHAR_CAP) {
      console.log(`${model.replace("gemini-", "")} ${ms}ms SKIPPED (hallucination, ${text.length}ch)`);
      emptyChunks++;
      continue;
    }

    const cleaned = cleanTranscriptChunk(text);
    const overlap = transcript.slice(-80);
    const words = cleaned.split(/\s+/).filter(Boolean);
    let startIdx = 0;
    for (let len = 1; len <= Math.min(10, words.length); len++) {
      const head = words.slice(0, len).join(" ");
      if (overlap.endsWith(head)) startIdx = len;
    }
    const deduped = words.slice(startIdx).join(" ");

    // Cross-chunk loop guard.
    if (deduped.length >= 60) {
      const probe = deduped.slice(0, 60);
      const recentTail = transcript.slice(-600);
      if (recentTail.includes(probe)) {
        console.log(`${model.replace("gemini-", "")} ${ms}ms SKIPPED (duplicate of recent)`);
        emptyChunks++;
        continue;
      }
    }

    if (deduped) transcript += (transcript ? " " : "") + deduped;

    console.log(`${model.replace("gemini-", "")} ${ms}ms +${deduped.length}ch`);
    if (cleaned.length < 200) {
      console.log(`     "${cleaned}"`);
    } else {
      console.log(`     "${cleaned.slice(0, 180)}..."`);
    }
    okChunks++;

    // pace to stay under per-minute rate limits (configurable via --delay)
    if (i < numChunks - 1) await sleep(delayMs);
  }

  console.log("\n════════════════════════════════════════════");
  console.log(`Done: ${okChunks} ok, ${emptyChunks} empty, ${failedChunks} failed`);
  console.log(`Transcript: ${transcript.length} chars`);
  console.log("════════════════════════════════════════════\n");

  console.log("─── RAW TRANSCRIPT (concatenated) ───");
  console.log(transcript);

  if (transcript.length >= 80) {
    console.log("\n─── POLISHED ───");
    const polished = await polishTranscript(transcript, courseType, topic);
    console.log(polished);
    if (outFile) {
      fs.writeFileSync(outFile, polished);
      console.log("\n→ Saved polished to", outFile);
    }
  } else if (outFile) {
    fs.writeFileSync(outFile, transcript);
    console.log("\n→ Saved raw to", outFile);
  }
})().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
