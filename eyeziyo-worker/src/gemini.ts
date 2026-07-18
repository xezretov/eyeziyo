/**
 * Gemini API client — handles all AI operations:
 * - Audio transcription (STT) with prev-chunk context
 * - Transcript polish (dedup repeats, fix punctuation) before save
 * - Lesson evaluation, test generation, mentor chat
 */

// Only models that are still available to new API users. Both 2.0 models
// returned 404 "no longer available to new users" during testing — keeping
// them in the fallback chain only adds latency.
const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",      // arzon birlamchi
  "gemini-2.5-flash",           // 503 paytida fallback
];

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/** Call Gemini with model fallback chain (429 → next model) */
async function callGemini(
  apiKey: string,
  prompt: string,
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const { temperature = 0.3, maxTokens = 4096, timeoutMs = 30000 } = opts;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    // gemini-2.5-flash is a thinking model: left on, reasoning tokens consume
    // the output budget and JSON replies get cut off (finishReason MAX_TOKENS).
    // These text tasks (glossary, test, evaluation) don't need chain-of-thought.
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(geminiUrl(model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) continue; // quota exhausted, try next
      if (!res.ok) continue;

      const data = (await res.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (text) return text;
    } catch {
      continue;
    }
  }
  return "";
}

/** Call Gemini with audio input (STT) */
async function callGeminiAudio(
  apiKey: string,
  audioBase64: string,
  instruction: string,
  mimeType = "audio/wav"
): Promise<string> {
  const payload = {
    contents: [
      {
        parts: [
          { text: instruction },
          { inline_data: { mime_type: mimeType, data: audioBase64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.0, maxOutputTokens: 600 },
  };

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(geminiUrl(model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 429) continue;
      if (!res.ok) continue;

      const data = (await res.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (text) return text;
    } catch {
      continue;
    }
  }
  return "";
}

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

export async function transcribeAudio(
  apiKey: string,
  wavBase64: string,
  courseType: string,
  topic: string,
  prevTail: string = "",
  glossary: string = ""
): Promise<string> {
  const tail = prevTail.trim().slice(-200);
  const contextBlock = tail
    ? `\nOLDINGI GAP OXIRI (faqat kontekst uchun, BU MATNNI QAYTARMA):\n"${tail}"\n\nHozirgi audio shu gapning davomi bo'lishi mumkin. Faqat YANGI eshitilgan so'zlarni yoz.\n`
    : "";

  const glossaryBlock = glossary
    ? `\nMAVZU LUG'ATI (shu darsda uchrashi mumkin bo'lgan atoqli ot, joy/shaxs nomi, atama):\n${glossary}\n\nAgar audioda shu lug'atdagi so'zga o'xshash narsa eshitsang, uni AYNAN lug'atdagidek yoz. Lekin lug'atdagi so'zni audioda YO'Q bo'lsa, zo'rdan kiritma.\n`
    : "";

  const instruction = `Sen ovozli nutqni matnga o'giruvchi transkriberisan. Sen REDAKTOR EMASSAN, faqat eshitgan narsangni yozasan.

Kontekst: ${courseType || "umumiy ta'lim"}${topic ? ` darsi, mavzu: ${topic}` : ""}
${glossaryBlock}${contextBlock}
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

  const raw = await callGeminiAudio(apiKey, wavBase64, instruction);
  return cleanTranscriptChunk(raw);
}

/**
 * Post-process a single chunk transcript:
 * - Strip timestamp tokens
 * - Detect and reject prompt leaks (Gemini echoing the instruction)
 * - Detect and truncate degenerative repetition loops
 */
function cleanTranscriptChunk(text: string): string {
  if (!text) return "";
  const stripped = stripTimestamps(text);
  if (!stripped) return "";

  if (isPromptLeak(stripped)) return "";

  return truncateRepetition(stripped);
}

function isPromptLeak(text: string): boolean {
  const head = text.slice(0, 200).toLowerCase();
  const signatures = [
    /^\s*sen\s+(ovozli|redaktor|transkriber)/,
    /^\s*kontekst\s*:/,
    /^\s*vazifa\s*:/,
    /^\s*qat['’]?iy\s+qoidalar/,
    /^\s*oldingi\s+gap\s+oxiri/,
    /^\s*audioyozuvdagi/,
    /^\s*faqat\s+transkriptni\s+qaytar/,
  ];
  return signatures.some((re) => re.test(head));
}

/**
 * Detect a degenerative repetition loop where a phrase of N words (6..60) is
 * repeated back-to-back ≥3 times, and truncate the text to a single copy.
 * Tries multiple phrase lengths so it catches both short stutters and long
 * paragraph-level loops. Iterates until no more loops are found (caps at 8
 * iterations so we never hang on pathological input).
 */
export function truncateRepetition(text: string): string {
  let cur = text;
  for (let iter = 0; iter < 8; iter++) {
    const next = truncateRepetitionOnce(cur);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

function truncateRepetitionOnce(text: string): string {
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
        const partial = tailWords.length < phraseLen &&
          phrase.startsWith(tailWords.join(" "));
        return partial || tailWords.length === 0
          ? kept
          : kept + " " + tailWords.join(" ");
      }
    }
  }
  return text;
}

/**
 * Safety net: strip timestamp tokens (00:05, [00:01], 1:23) that sometimes
 * leak through despite the prompt's instruction.
 */
function stripTimestamps(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[?\b\d{1,2}:\d{2}(?::\d{2})?\]?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^\s+|\s+$/g, "");
}

/**
 * Polish the full transcript after all chunks are collected.
 * Fixes punctuation and removes accidental sentence-level duplication
 * WITHOUT adding any new content. If the model expands the text by more
 * than 20% we reject the polish and keep the raw transcript.
 */
export async function polishTranscript(
  apiKey: string,
  rawTranscript: string,
  courseType: string,
  topic: string
): Promise<string> {
  const raw = rawTranscript.trim();
  if (raw.length < 80) return rawTranscript;

  // First, locally strip any obvious back-to-back paragraph loops before
  // sending to Gemini. Cheap, deterministic, and means the LLM never sees
  // the giant duplicated blob in the first place.
  const deduped = truncateRepetition(raw);

  const prompt = `Sen transkriptsiya tahrirchisisan. Quyidagi matnni FAQAT quyidagi chegarada tuzat.

KURS: ${courseType || "umumiy"}
MAVZU: ${topic || "—"}

RUXSAT ETILGAN:
1. Ketma-ket takrorlangan bir xil gap yoki iborani olib tashla (masalan bir gap 3 marta yozilgan bo'lsa — bittasi qolsin).
2. Tinish belgilari (nuqta, vergul, savol), bosh harflarni to'g'rila.
3. Juda aniq imlo xatolarini tuzat (masalan "backendda" "backend'da").

QAT'IY TAQIQ:
- YANGI gap, yangi abzats, yangi mavzu QO'SHMA.
- "JavaScript juda yaxshi til", "amaliy mashg'ulot qilamiz" kabi tarkibni KENGAYTIRMA.
- Parafraz qilma — so'zlarni almashtirma.
- Tarjima qilma.
- Agar biror gap tushunarsiz yoki yarim kesilgan bo'lsa — shundayligicha qoldir.
- Matn uzunligini sezilarli darajada oshirma.
- Markdown, izoh, sarlavha qo'shma.

ORIGINAL TRANSKRIPT:
${deduped}

TUZATILGAN TRANSKRIPT (faqat toza matn):`;

  const maxTokens = Math.min(4096, Math.max(512, Math.ceil(deduped.length / 2)));
  const polished = await callGemini(apiKey, prompt, {
    temperature: 0.0,
    maxTokens,
    timeoutMs: 60000,
  });

  const cleaned = polished.trim();
  if (!cleaned) return deduped;

  // Safety guards. Compare polished against the pre-dedup `raw` because the
  // polished text may legitimately be much shorter than `raw` when `raw`
  // contains paragraph-level loops — but it should still cover the content.
  // Upper guard stays strict to catch the model hallucinating new material.
  if (cleaned.length > raw.length * 1.2) return deduped;
  // Lower guard: polish is suspect only if it drops below 15% of the
  // ALREADY-DEDUPED length (real content). Absolute floor of 40 chars.
  if (cleaned.length < Math.max(40, deduped.length * 0.15)) return deduped;

  return cleaned;
}

export async function generateLessonTerms(
  apiKey: string,
  courseType: string,
  topic: string
): Promise<string> {
  const prompt = `Sen speech-to-text modelining aniqligini oshirish uchun lug'at tuzuvchisan.

KURS: ${courseType}
MAVZU: ${topic}

Shu darsida o'qituvchi aytishi ehtimoli yuqori bo'lgan 25-35 ta asosiy so'zni ro'yxatlab ber.

JAVOB FAQAT JSON formatida:
{"terms": ["so'z1", "so'z2", "so'z3", ...]}`;

  const raw = await callGemini(apiKey, prompt, { temperature: 0.2, maxTokens: 512, timeoutMs: 15000 });
  if (!raw) return "";

  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:\w+)?\s*/, "").replace(/`+$/, "").trim();
    }
    const data = JSON.parse(cleaned);
    const terms = (data.terms || [])
      .flatMap((t: string) => t.split(/\s+/))
      .map((w: string) => w.replace(/[,.;:()[\]{}]/g, "").trim())
      .filter(Boolean);
    // Dedupe
    return [...new Set(terms)].slice(0, 45).join(" ");
  } catch {
    return raw.split("\n")[0].trim().split(" ").slice(0, 40).join(" ");
  }
}

/**
 * Build a proper-noun glossary for STT from just the course + topic (no
 * transcript needed). Unlike generateLessonTerms this PRESERVES multi-word
 * names ("Tug'luq Temur", "Amir Husayn") and returns them comma-joined, ready
 * to inject into the transcription prompt. Generated once per recording and
 * reused for every chunk. Measured to cut proper-noun substitution errors
 * substantially (368 -> 227 word errors on the Amir Temur test lesson).
 */
export async function generateTranscriptionGlossary(
  apiKey: string,
  courseType: string,
  topic: string
): Promise<string> {
  if (!topic.trim()) return "";

  const prompt = `Sen speech-to-text aniqligini oshirish uchun lug'at tuzuvchisan.

KURS: ${courseType}
MAVZU: ${topic}

Shu mavzudagi darsda o'qituvchi aytishi ehtimoli yuqori bo'lgan ATOQLI OTLAR (shaxs, joy, sulola nomlari), atamalar va sanalarni ro'yxatla. Ayniqsa transkriberga qiyin bo'ladigan o'ziga xos nomlarga e'tibor ber.

JAVOB FAQAT JSON, FAQAT so'zlar ro'yxati (tavsif YO'Q, object YO'Q), 30-50 ta element:
{"terms": ["Movarounnahr", "Tug'luq Temur", "Sarbadorlar"]}`;

  const raw = await callGemini(apiKey, prompt, { temperature: 0.2, maxTokens: 2048, timeoutMs: 15000 });
  if (!raw) return "";

  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:\w+)?\s*/, "").replace(/`+$/, "").trim();
    }
    const data = JSON.parse(cleaned);
    const terms = (data.terms || [])
      .map((t: any) => String(t).trim())
      .filter(Boolean);
    return [...new Set(terms)].slice(0, 60).join(", ");
  } catch {
    return "";
  }
}

export interface LessonEvaluation {
  overall_score: number;
  clarity_score: number;
  engagement_score: number;
  content_score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  advice: string[];
}

export async function evaluateLesson(
  apiKey: string,
  transcript: string,
  courseType: string,
  topic: string,
  durationMinutes: number
): Promise<LessonEvaluation> {
  const empty: LessonEvaluation = {
    overall_score: 0, clarity_score: 0, engagement_score: 0, content_score: 0,
    summary: "", strengths: [], improvements: [], advice: [],
  };
  if (!transcript || transcript.length < 20) return empty;

  // Truncate long transcripts
  const maxChars = 8000;
  const processed = transcript.length > maxChars
    ? transcript.slice(0, maxChars * 0.3) + "\n[...]\n" + transcript.slice(-maxChars * 0.3)
    : transcript;

  const prompt = `Sen tajribali ta'lim ekspertisan. Darsni transkript asosida diqqat bilan baholab, maslahatlar ber.

DARS: ${courseType} · ${topic} · ${durationMinutes} daqiqa

TRANSKRIPT:
${processed}

BAHOLASH MEZONLARI (har biri 0 dan 100 gacha BUTUN SON):
- clarity_score — o'qituvchi nutqi qanchalik tushunarli, mantiqiy tuzilgan
- engagement_score — o'quvchini jalb qilish, savollar berish, qiziqarli yondashuv
- content_score — mavzu chuqurligi, aniqlik, misollar sifati
- overall_score — yuqoridagi uchtasining vaznli o'rtacha qiymati

QAT'IY:
- Har bir ballni transkriptda haqiqatan ko'ringan dalillar asosida hisobla.
- 35 yoki 50 kabi standart "o'rtacha" raqamlardan qochib, real darajaga mos ball qo'y.
- Kuchli, mazmunli dars uchun 75-95 oralig'i ham kerak bo'lsa qo'y.
- Zaif yoki bo'sh dars uchun 10-30 oralig'iga tushir.
${durationMinutes <= 2 ? "- BU JUDA QISQA DARS (≤2 daqiqa) — overall_score va content_score 40 dan oshmasin." : ""}

JAVOB FORMATI — faqat JSON, boshqa hech narsa yo'q. Quyidagi shema bo'yicha qaytar:
{
  "overall_score": <0-100 butun son>,
  "clarity_score": <0-100 butun son>,
  "engagement_score": <0-100 butun son>,
  "content_score": <0-100 butun son>,
  "summary": "<2-3 gap dars haqida xulosa>",
  "strengths": ["<kuchli tomon 1>", "<kuchli tomon 2>"],
  "improvements": ["<yaxshilash kerak bo'lgan joy 1>", "<yaxshilash kerak bo'lgan joy 2>"],
  "advice": ["<aniq maslahat 1>", "<aniq maslahat 2>"]
}`;

  const raw = await callGemini(apiKey, prompt, { temperature: 0.3, maxTokens: 2048, timeoutMs: 60000 });
  if (!raw) return empty;

  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:\w+)?\s*/, "").replace(/`+$/, "").trim();
    }
    const data = JSON.parse(cleaned);
    // Clamp scores to 0..100 — the model occasionally returns out-of-range or
    // non-numeric values which would otherwise be persisted verbatim.
    const score = (v: any) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    };
    return {
      overall_score: score(data.overall_score),
      clarity_score: score(data.clarity_score),
      engagement_score: score(data.engagement_score),
      content_score: score(data.content_score),
      summary: data.summary ?? "",
      strengths: Array.isArray(data.strengths) ? data.strengths : [],
      improvements: Array.isArray(data.improvements) ? data.improvements : [],
      advice: Array.isArray(data.advice) ? data.advice : [],
    };
  } catch {
    return empty;
  }
}

export { callGemini };

// Files larger than this (raw bytes) can't go in an inline Gemini request
// (~20MB request cap). Above it we upload via the Files API and reference the
// file by URI instead.
const INLINE_AUDIO_LIMIT = 14 * 1024 * 1024;

function transcriptionInstruction(courseType: string, topic: string): string {
  return `Sen ovozli nutqni matnga o'giruvchi transkriberisan. Sen REDAKTOR EMASSAN, faqat eshitgan narsangni so'zma-so'z yozasan.

Kontekst: ${courseType || "umumiy ta'lim"}${topic ? ` darsi, mavzu: ${topic}` : ""}

VAZIFA: Audioyozuvdagi o'zbek tilidagi nutqni boshidan oxirigacha, aynan eshitganingdek yoz.

QAT'IY QOIDALAR:
1. VAQT MARKERLARI YO'Q — "00:00", "[00:01]" kabi belgilarni qo'shma.
2. HECH NIMA O'YLAB TOPMA — aniq eshitilmagan so'zni yozma yoki "[...]" qoldir. Bo'sh joyni "mos" so'z bilan to'ldirma. Bir gapni qayta-qayta takrorlama; loop'ga tushsang to'xta.
3. NOMLAR — brend va atamalarni asl holida yoz: GitHub, Node.js, JavaScript, console.log, API, SQL, HTML, CSS.
4. TALAFFUZ — faqat aniq xatolarni tuzat: payton→Python, vekent→backend, jeyeson→JSON.
5. FORMAT — faqat toza matn (nuqta, vergul, savol belgisi). Markdown YO'Q, izoh YO'Q. Instruksiya parchalarini ("Kontekst:", "VAZIFA:") qaytarma.
6. SHOVQIN/JIMLIK — nutq bo'lmasa, bo'sh satr qaytar.

Faqat transkriptni qaytar, boshqa hech narsa qo'shma.`;
}

/** Encode bytes to base64 in 32KB chunks (avoids call-stack overflow on big files). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Upload audio to the Gemini Files API (resumable protocol) and wait until it
 * is ACTIVE. Returns the file URI + resource name, or null on failure. Used for
 * files too large to inline. Uploaded files auto-expire after 48h.
 */
async function uploadAudioToGeminiFiles(
  apiKey: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<{ uri: string; name: string } | null> {
  const numBytes = bytes.byteLength;
  const base = "https://generativelanguage.googleapis.com";

  // 1. Start a resumable upload session.
  const start = await fetch(`${base}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(numBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "geminitest-audio" } }),
  });
  if (!start.ok) return null;
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) return null;

  // 2. Upload the bytes and finalize in one shot.
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(numBytes),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!up.ok) return null;
  const upData = (await up.json()) as any;
  let file = upData?.file;
  if (!file?.name) return null;

  // 3. Audio is often PROCESSING right after upload — poll until ACTIVE.
  let state: string = file.state;
  let uri: string = file.uri;
  for (let i = 0; i < 30 && state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(`${base}/v1beta/${file.name}`, { headers: { "x-goog-api-key": apiKey } });
    if (!st.ok) break;
    const sd = (await st.json()) as any;
    state = sd.state;
    uri = sd.uri || uri;
  }
  if (state !== "ACTIVE" || !uri) return null;
  return { uri, name: file.name };
}

/** Best-effort delete of a Files API upload (cleanup after transcription). */
async function deleteGeminiFile(apiKey: string, name: string): Promise<void> {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey },
    });
  } catch { /* ignore */ }
}

/** Run a one-shot transcription generateContent call over the model fallback chain. */
async function runTranscription(
  apiKey: string,
  audioPart: Record<string, any>,
  instruction: string,
  maxOutputTokens: number,
  modelOverride?: string
): Promise<{ transcript: string; model: string }> {
  const payload = {
    contents: [{ parts: [{ text: instruction }, audioPart] }],
    // Transcription needs no chain-of-thought; reasoning tokens would just eat
    // the output budget on the 2.5-flash thinking model.
    generationConfig: { temperature: 0.0, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
  };

  const models = modelOverride ? [modelOverride] : GEMINI_MODELS;
  for (const model of models) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      const res = await fetch(geminiUrl(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (text) return { transcript: cleanTranscriptChunk(text), model };
    } catch {
      continue;
    }
  }
  return { transcript: "", model: "" };
}

/**
 * One-shot full-file transcription for the admin "Gemini test" tool.
 *
 * Unlike the streaming `transcribeAudio` (12-second chunks with prev-chunk
 * context), this sends the WHOLE file in a single request. Small files go
 * inline; large files (>14MB) are uploaded via the Files API and referenced
 * by URI — removing the ~20MB inline cap. Returns the cleaned transcript and
 * the model that actually produced it.
 *
 * `modelOverride` pins a specific model; otherwise the fallback chain is used.
 */
export async function transcribeAudioFile(
  apiKey: string,
  bytes: Uint8Array,
  mimeType: string,
  courseType: string,
  topic: string,
  modelOverride?: string
): Promise<{ transcript: string; model: string }> {
  const instruction = transcriptionInstruction(courseType, topic);

  // Small file → inline. Modest output budget is plenty for short clips.
  if (bytes.byteLength <= INLINE_AUDIO_LIMIT) {
    const audioPart = { inline_data: { mime_type: mimeType, data: bytesToBase64(bytes) } };
    return runTranscription(apiKey, audioPart, instruction, 8192, modelOverride);
  }

  // Large file → Files API. Bigger output budget for long lessons.
  const uploaded = await uploadAudioToGeminiFiles(apiKey, bytes, mimeType);
  if (!uploaded) return { transcript: "", model: "" };
  try {
    const audioPart = { file_data: { mime_type: mimeType, file_uri: uploaded.uri } };
    return await runTranscription(apiKey, audioPart, instruction, 32768, modelOverride);
  } finally {
    await deleteGeminiFile(apiKey, uploaded.name);
  }
}

// ═══════════════════════════════════════════════════════
// Mentor features: test generation + chat tutor
// ═══════════════════════════════════════════════════════

export interface LessonQuestion {
  q: string;
  choices: string[];
  correct: number;
  explanation: string;
}

export interface LessonKeyTerm {
  term: string;
  explanation: string;
}

export interface LessonTestPackage {
  questions: LessonQuestion[];
  key_terms: LessonKeyTerm[];
}

export async function generateLessonTest(
  apiKey: string,
  transcript: string,
  courseType: string,
  topic: string
): Promise<LessonTestPackage> {
  const empty: LessonTestPackage = { questions: [], key_terms: [] };
  if (!transcript || transcript.length < 40) return empty;

  const truncated = transcript.length > 7000 ? transcript.slice(0, 7000) + "..." : transcript;

  const prompt = `Sen ta'lim mentor AI'sisan. Quyidagi dars transkriptsiyasi asosida o'quvchi uchun sodda test va muhim terminlar tayyorla.

KURS: ${courseType}
MAVZU: ${topic}

DARS TRANSKRIPT:
${truncated}

VAZIFA:
1. 10 ta test savoli. Har biri 4 variantli (A-D). Faqat dars ichida aytilgan narsalar asosida.
2. 6-10 ta muhim termin. Har biriga 1-2 gaplik sodda, o'quvchi tiliga moslashtirilgan tushuntirish.

QAT'IY QOIDALAR:
- O'zbek tilida javob ber
- Savollar aniq va tushunarli bo'lsin
- "correct" maydoni 0-3 orasida (0=A, 1=B, 2=C, 3=D)
- "explanation" — nima uchun shu javob to'g'ri, 1-2 gap
- Darsdan tashqari ma'lumot qo'shma

JAVOB FAQAT JSON formatida:
{
  "questions": [
    {
      "q": "Savol matni?",
      "choices": ["Variant A", "Variant B", "Variant C", "Variant D"],
      "correct": 1,
      "explanation": "Nima uchun B to'g'ri"
    }
  ],
  "key_terms": [
    {"term": "JavaScript", "explanation": "Veb saytlarga harakat beruvchi dasturlash tili"}
  ]
}`;

  const raw = await callGemini(apiKey, prompt, { temperature: 0.3, maxTokens: 4096, timeoutMs: 45000 });
  if (!raw) return empty;

  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:\w+)?\s*/, "").replace(/`+$/, "").trim();
    }
    const data = JSON.parse(cleaned);
    const questions = Array.isArray(data.questions) ? data.questions.slice(0, 12).map((q: any) => ({
      q: String(q.q || "").trim(),
      choices: Array.isArray(q.choices) ? q.choices.slice(0, 4).map(String) : [],
      correct: Number.isInteger(q.correct) ? Math.max(0, Math.min(3, q.correct)) : 0,
      explanation: String(q.explanation || "").trim(),
    })).filter((q: LessonQuestion) => q.q && q.choices.length === 4) : [];

    const key_terms = Array.isArray(data.key_terms) ? data.key_terms.slice(0, 12).map((t: any) => ({
      term: String(t.term || "").trim(),
      explanation: String(t.explanation || "").trim(),
    })).filter((t: LessonKeyTerm) => t.term && t.explanation) : [];

    return { questions, key_terms };
  } catch {
    return empty;
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function chatWithLesson(
  apiKey: string,
  transcript: string,
  courseType: string,
  topic: string,
  history: ChatTurn[],
  userMessage: string
): Promise<string> {
  if (!userMessage.trim()) return "";

  const truncated = transcript.length > 6000 ? transcript.slice(0, 6000) + "..." : transcript;
  const historyText = history.slice(-10).map(t => `${t.role === "user" ? "O'QUVCHI" : "MENTOR"}: ${t.content}`).join("\n\n");

  const prompt = `Sen "Eyeziyo Mentor" — ta'lim AI yordamchisisan. O'qituvchi darsni o'tib bo'ldi, endi sen o'quvchiga do'stona, sabrli tarzda tushuntirasan.

KURS: ${courseType}
MAVZU: ${topic}

DARS TRANSKRIPTSIYASI (o'qituvchi shuni aytdi):
${truncated}

OLDINGI SUHBAT:
${historyText || "(yo'q)"}

O'QUVCHI YANGI XABARI:
${userMessage}

VAZIFA:
- O'quvchining savoliga sodda, tushunarli tilda javob ber
- Javobni birinchi navbatda dars ichidagi material asosida tuz
- Agar dars ichida yo'q bo'lsa, qisqa umumiy ma'lumot ber va "O'qituvchingiz darsda bu haqda aytmagan" deb belgilab qo'y
- Misollar va analogiyalarni 14-18 yoshdagi o'quvchi tushunadigan darajada tanla
- 3-6 gap, juda uzun yozma. Agar kod kerak bo'lsa, qisqa snippet ber
- O'zbek tilida

Faqat javob matnini qaytar, format belgilari yo'q.`;

  const reply = await callGemini(apiKey, prompt, { temperature: 0.6, maxTokens: 1024, timeoutMs: 30000 });
  return reply.trim();
}
