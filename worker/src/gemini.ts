import { hasMarkers, countMarkers, parseLabeled, formatLabeled, condenseForEval, computeStats, statsSummaryUz, LessonStats, numberedLines, relabelRanges, relabelByTime, parseClock, fmtClock, Who } from "./timeline";
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
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number; onUsage?: (u: GeminiUsage) => void; model?: string } = {}
): Promise<string> {
  return (await callGeminiWithModel(apiKey, prompt, opts)).text;
}

/** callGemini bilan bir xil, lekin javob bergan model nomini ham qaytaradi. */
async function callGeminiWithModel(
  apiKey: string,
  prompt: string,
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number; onUsage?: (u: GeminiUsage) => void; model?: string } = {}
): Promise<{ text: string; model: string }> {
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

  const chain = opts.model ? [opts.model, ...GEMINI_MODELS.filter((m) => m !== opts.model)] : GEMINI_MODELS;
  for (const model of chain) {
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
      const uu = usageFrom(data, model);
      if (uu && opts.onUsage) opts.onUsage(uu);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (text) return { text, model };
    } catch {
      continue;
    }
  }
  return { text: "", model: "" };
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
export function cleanTranscriptChunk(text: string): string {
  if (!text) return "";
  // Yorliqli transkript: har parcha alohida tozalanadi, yorliq va vaqt saqlanadi.
  if (hasMarkers(text)) {
    const segs = parseLabeled(text)
      .map((s) => ({ ...s, text: truncateRepetition(stripNoSpeechNoise(stripTimestamps(s.text))) }))
      .filter((s) => s.text && /\p{L}/u.test(s.text));
    if (!segs.length) return "";
    if (isPromptLeak(segs[0].text)) return "";
    return formatLabeled(segs);
  }
  const stripped = stripNoSpeechNoise(stripTimestamps(text));
  if (!stripped) return "";

  if (isPromptLeak(stripped)) return "";

  return truncateRepetition(stripped);
}

/**
 * Nutq bo'lmagan (shovqin/jimlik) audio uchun model "Bu yerda hech qanday
 * ovozli nutq yo'q." deb yozadi yoki "........" / "ммм" kabi bir belgini
 * minglab takrorlaydi (2026-09-15, yozuv #12: 11 621 belgi, 29 "so'z").
 * Bunday satrlar va 4+ uzunlikdagi tinish belgisi qatorlari olib tashlanadi —
 * haqiqiy nutq yo'q bo'lsa natija bo'sh qaytadi.
 */
const NO_SPEECH_LINE = /^(?:\W|_)*(?:(?:bu yerda |audioda |yozuvda )?(?:hech qanday |hech qanaqa )?(?:ovozli |aniq )?(?:nutq|gap|ovoz|so'z|suhbat)\w*\s+(?:yo'q|mavjud emas|eshitilmaydi|aniqlanmadi)|jimlik|shovqin|\[?(?:musiqa|music|silence|noise)\]?)[\s\W]*$/i;
function stripNoSpeechNoise(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/([^\w\s'’])\1{3,}/g, "").trim())
    .filter((line) => line && !NO_SPEECH_LINE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  topic: string,
  onUsage?: (u: GeminiUsage) => void
): Promise<string> {
  const raw = rawTranscript.trim();
  if (raw.length < 80) return rawTranscript;

  // First, locally strip any obvious back-to-back paragraph loops before
  // sending to Gemini. Cheap, deterministic, and means the LLM never sees
  // the giant duplicated blob in the first place.
  const deduped = truncateRepetition(raw);

  const prompt = `Sen transkriptsiya tahrirchisisan. Quyidagi matnni FAQAT quyidagi chegarada tuzat.

(Kurs: ${courseType || "umumiy"}; mavzu: ${topic || "—"} — bu satrni javobga YOZMA.)

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
- Qator boshidagi [MM:SS O'QITUVCHI] / [MM:SS TALABA] / [MM:SS VIDEO] yorliqlarini AYNAN saqla: o'chirma, o'zgartirma, birlashtirma, yangisini qo'shma. Qatorlar tartibini saqla.

ORIGINAL TRANSKRIPT:
${deduped}

TUZATILGAN TRANSKRIPT (faqat toza matn):`;

  // Uzun dars (60k+ belgi) 4096 tokenda qirqilib qolmasin — flash-lite 65k gacha beradi.
  const maxTokens = Math.min(32768, Math.max(1024, Math.ceil(deduped.length / 2)));
  const polished = await callGemini(apiKey, prompt, {
    temperature: 0.0,
    maxTokens,
    timeoutMs: 120000,
    onUsage,
  });

  // Model ba'zan kurs/mavzu satrlarini javob boshiga qaytaradi (2026-09-25, #73: har bo'lakda
  // "KURS: Statistika MAVZU: ..." transkriptga tushgan) — olib tashlaymiz.
  const cleaned = polished
    .split("\n")
    .filter((l) => !/^\s*\(?\s*(kurs|mavzu)\s*:/i.test(l))
    .join("\n")
    .trim();
  if (!cleaned) return deduped;
  // Yorliqlar yo'qolgan/ko'paygan bo'lsa polish ishonchsiz — asl matn qoladi.
  if (hasMarkers(deduped) && Math.abs(countMarkers(cleaned) - countMarkers(deduped)) > Math.max(1, countMarkers(deduped) * 0.1)) return deduped;

  // Safety guards. Compare polished against the pre-dedup `raw` because the
  // polished text may legitimately be much shorter than `raw` when `raw`
  // contains paragraph-level loops — but it should still cover the content.
  // Upper guard stays strict to catch the model hallucinating new material.
  if (cleaned.length > raw.length * 1.2) return deduped;
  // Lower guard: polish is suspect only if it drops below 15% of the
  // ALREADY-DEDUPED length (real content). Absolute floor of 40 chars.
  // Qirqilgan (MAX_TOKENS) javobni qabul qilmaymiz — 60% dan qisqa bo'lsa asl matn qoladi.
  if (cleaned.length < Math.max(40, deduped.length * 0.6)) return deduped;

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
  model?: string;             // javob bergan Gemini modeli
  overall_score: number;      // 5 mezon yig'indisi (0-100)
  topic_score: number;        // Mavzu mosligi va ilmiy terminologiya (0-20)
  speech_score: number;       // Nutq maqsadliligi va akademik tozalik (0-20)
  method_score: number;       // Metodik mahorat va tushuntirish uslubi (0-20)
  interaction_score: number;  // Interaktivlik va talabalar qamrovi (0-20)
  feedback_score: number;     // Baholash va teskari aloqa (Feedback) (0-20)
  summary: string;
  strengths: string[];
  improvements: string[];
  advice: string[];
  /** Dars bosqichlari + ovoz manbalari statistikasi (yorliqli transkript bo'lsa). */
  timeline?: { phases: LessonPhase[]; stats: LessonStats | null; media_note: string };
}

export interface LessonPhase { from: number; to: number; type: string; note: string }

export async function evaluateLesson(
  apiKey: string,
  transcript: string,
  courseType: string,
  topic: string,
  durationMinutes: number,
  onUsage?: (u: GeminiUsage) => void
): Promise<LessonEvaluation> {
  const empty: LessonEvaluation = {
    overall_score: 0, topic_score: 0, speech_score: 0, method_score: 0,
    interaction_score: 0, feedback_score: 0,
    summary: "", strengths: [], improvements: [], advice: [],
  };
  if (!transcript || transcript.length < 20) return empty;

  // Juda uzun transkriptlarni qirqamiz — 120k belgi (~90 daqiqalik dars 60k atrofida,
  // flash-lite konteksti 1M token). Avvalgi 4800 belgi darsning ~8% ini ko'rardi.
  const maxChars = 120000;
  // Yorliqli transkript (2026-09-28): VIDEO parchalari qisqa izohga almashtiriladi va ovoz
  // manbalari statistikasi promptga beriladi — video diktori o'qituvchi nutqi deb baholanmaydi.
  const labeled = hasMarkers(transcript);
  const stats = labeled ? computeStats(transcript, durationMinutes * 60) : null;
  const evalText = labeled ? condenseForEval(transcript) : transcript;
  const processed = evalText.length > maxChars
    ? evalText.slice(0, maxChars * 0.5) + "\n[...]\n" + evalText.slice(-maxChars * 0.5)
    : evalText;
  const labeledBlock = labeled ? `
TRANSKRIPT FORMATI: har qator [vaqt MANBA] matn. MANBA: O'QITUVCHI (jonli nutq), TALABA (talabalar), VIDEO (darsda qo'yilgan yozib olingan video/audio — matni qisqartirilgan).

OVOZ MANBALARI STATISTIKASI (audio bo'yicha hisoblangan):
${stats ? statsSummaryUz(stats) : "—"}

VIDEO/MEDIA QOIDALARI:
- VIDEO parchalari o'qituvchi nutqi EMAS. topic_score, speech_score va method_score uchun dalilni faqat O'QITUVCHI va TALABA parchalaridan ol.
- Video qo'yish metodik usul bo'lishi mumkin: o'qituvchi videoni mavzuga bog'lab tanishtirgan va keyin muhokama qilgan bo'lsa, method_score da buni ijobiy hisobla; izohsiz uzoq video — salbiy.
- Video dars vaqtining 30% dan ko'pini egallasa, speech_score 12 dan oshmasin va buni improvements da aniq ko'rsat (necha daqiqa, qaysi vaqt oralig'i).
- interaction_score ni TALABA ulushi va TALABA qatorlari soniga tayanib qo'y.
` : "";

  const prompt = `Sen pedagogika fanlari bo'yicha tajribali metodist-ekspertsan. O'qituvchi darsini transkript asosida diqqat bilan baholab, professional metodik tavsiyalar ber.

DARS: ${courseType} · ${topic} · ${durationMinutes} daqiqa
${labeledBlock}
TRANSKRIPT:
${processed}

BAHOLASH MEZONLARI (har biri 0 dan 20 gacha BUTUN SON):
- topic_score — Mavzu mosligi va ilmiy terminologiya: dars rejasi/sillabusga mosligi, sohaga oid tayanch kalit so'zlar zichligi va terminlarning to'g'ri kontekstda ishlatilishi.
- speech_score — Nutq maqsadliligi va akademik tozalik: dars vaqtining faqat ilmga yo'naltirilgani; mavzudan tashqari suhbatlar, shaxsiy hikoyalar, uzoq tanbehlar va parazit so'zlar qancha kam bo'lsa, ball shuncha yuqori.
- method_score — Metodik mahorat va tushuntirish uslubi: darsning mantiqiy tuzilishi (kirish, asosiy qism, xulosa) va amaliy/hayotiy misollardan foydalanish darajasi.
- interaction_score — Interaktivlik va talabalar qamrovi: dialog balansi (o'qituvchi/talaba nutqi nisbati) va o'qituvchi bergan savollar soni; monolog emas, faol muloqot.
- feedback_score — Baholash va teskari aloqa: talaba javoblariga munosabat (rag'batlantirish/xatoni tushuntirish), mustahkamlash savollari va uyga vazifa ko'rsatmalari.
- overall_score — yuqoridagi 5 mezonning YIG'INDISI (0-100).

QAT'IY:
- Har bir ballni transkriptda haqiqatan ko'ringan dalillar asosida hisobla.
- 10 yoki 12 kabi standart "o'rtacha" raqamlardan qochib, real darajaga mos ball qo'y.
- Kuchli mezon uchun 15-20, zaif mezon uchun 2-8 oralig'iga ham tush.
- overall_score AYNAN 5 mezon yig'indisiga teng bo'lsin.
${durationMinutes <= 2 ? "- BU JUDA QISQA DARS (≤2 daqiqa) — har bir mezon 8 dan oshmasin." : ""}

TAVSIYALAR (advice) TALABLARI:
- Kamida 8, ko'pi bilan 12 ta tavsiya yoz — har bir mezon (mavzu, nutq, metodika, interaktivlik, baholash) bo'yicha kamida bittadan tavsiya bo'lsin.
- Har bir tavsiya professional metodik tilda, aniq va amaliy bo'lsin: nimani, qanday usul bilan va qanday natija kutilishini ko'rsat.
- Umumiy gaplardan (\"darsni yaxshilang\") qoch — transkriptdagi aniq holatlarga tayangan, zamonaviy pedagogik metodlarga (interfaol usullar, formativ baholash, faol o'qitish strategiyalari) asoslangan tavsiyalar ber.
- Eng past ball olgan mezonlarga alohida e'tibor qarat.
- strengths va improvements uchun ham kamida 4 tadan band yoz.

JAVOB FORMATI — faqat JSON, boshqa hech narsa yo'q. Quyidagi shema bo'yicha qaytar:
{
  "topic_score": <0-20 butun son>,
  "speech_score": <0-20 butun son>,
  "method_score": <0-20 butun son>,
  "interaction_score": <0-20 butun son>,
  "feedback_score": <0-20 butun son>,
  "overall_score": <0-100 butun son (5 mezon yig'indisi)>,
  "summary": "<2-3 gap dars haqida xulosa>",
  "strengths": ["<kuchli tomon 1>", "<kuchli tomon 2>", "<kuchli tomon 3>"],
  "improvements": ["<yaxshilash kerak bo'lgan joy 1>", "<yaxshilash kerak bo'lgan joy 2>", "<yaxshilash kerak bo'lgan joy 3>"],
  "advice": ["<professional metodik tavsiya 1>", "<tavsiya 2>", "<tavsiya 3>", "<tavsiya 4>", "<tavsiya 5>", "<tavsiya 6>", "<tavsiya 7>", "<tavsiya 8>"]${labeled ? `,
  "phases": [{"from": <boshlanish daqiqasi>, "to": <tugash daqiqasi>, "type": "<tashkiliy | kirish | yangi mavzu | misol | video | savol-javob | amaliy ish | mustahkamlash | uy vazifasi | mavzudan tashqari | jimlik>", "note": "<shu bosqichda nima bo'ldi, 1 gap>"}],
  "media_note": "<video/media ishlatilishi haqida 1-2 gap: qancha vaqt, mavzuga mosmi, o'qituvchi izohladimi; video bo'lmasa bo'sh satr>"` : ""}
}${labeled ? "\n\nphases — darsning boshidan oxirigacha xronologik bosqichlari (5–12 ta). Vaqtni qator boshidagi [MM:SS] dan DAQIQADA ol (0 dan ${durationMinutes} gacha), oraliqlar ketma-ket va butun darsni qoplasin." : ""}`;

  const { text: raw, model: usedModel } = await callGeminiWithModel(apiKey, prompt, { temperature: 0.3, maxTokens: 8192, timeoutMs: 90000, onUsage });
  if (!raw) return empty;

  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:\w+)?\s*/, "").replace(/`+$/, "").trim();
    }
    const data = JSON.parse(cleaned);
    // Clamp each criterion to 0..20 — the model occasionally returns
    // out-of-range or non-numeric values which would otherwise be persisted.
    const crit = (v: any) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(20, Math.max(0, n)) : 0;
    };
    const topic_score = crit(data.topic_score);
    const speech_score = crit(data.speech_score);
    const method_score = crit(data.method_score);
    const interaction_score = crit(data.interaction_score);
    const feedback_score = crit(data.feedback_score);
    // overall is always the sum of the 5 criteria so it can never disagree with
    // the breakdown, regardless of what the model returns for overall_score.
    // Video dars vaqtining katta qismini egallasa nutq bahosi cheklanadi (model qoidani
    // e'tiborsiz qoldirsa ham). 30%+ → speech ≤ 12, 50%+ → speech ≤ 8, method ≤ 14.
    let speech_final = speech_score, method_final = method_score;
    if (stats && stats.media_pct >= 30) speech_final = Math.min(speech_final, 12);
    if (stats && stats.media_pct >= 50) { speech_final = Math.min(speech_final, 8); method_final = Math.min(method_final, 14); }
    const overall_score = topic_score + speech_final + method_final + interaction_score + feedback_score;
    const toMin = (v: any) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : 0; };
    const phases: LessonPhase[] = Array.isArray(data.phases)
      ? data.phases.map((p: any) => ({ from: toMin(p?.from), to: toMin(p?.to), type: String(p?.type || "").slice(0, 40), note: String(p?.note || "").slice(0, 300) }))
          .filter((p: LessonPhase) => p.to > p.from)
      : [];
    // Model vaqtni noto'g'ri o'qisa (#73: 80 daqiqalik dars uchun 120 gacha) — dars uzunligiga moslaymiz.
    const maxTo = phases.reduce((a, p) => Math.max(a, p.to), 0);
    if (maxTo > durationMinutes * 1.05 && maxTo > 0) {
      const k = durationMinutes / maxTo;
      for (const p of phases) { p.from = Math.round(p.from * k * 10) / 10; p.to = Math.round(p.to * k * 10) / 10; }
    }
    return {
      model: usedModel,
      overall_score,
      topic_score,
      speech_score: speech_final,
      method_score: method_final,
      interaction_score,
      feedback_score,
      summary: data.summary ?? "",
      strengths: Array.isArray(data.strengths) ? data.strengths : [],
      improvements: Array.isArray(data.improvements) ? data.improvements : [],
      advice: Array.isArray(data.advice) ? data.advice : [],
      timeline: labeled ? { phases, stats, media_note: String(data.media_note || "").slice(0, 600) } : undefined,
    };
  } catch {
    return empty;
  }
}

export { callGemini };

/**
 * Butun dars transkripti bo'yicha matnli tekshiruv (flash-lite, ~$0.003): STT 5 daqiqalik bo'laklarda
 * dublyaj qilingan (o'zbekcha) video diktorini ko'pincha O'QITUVCHI deb belgilaydi — butun darsni
 * ko'rgan model diktor/ssenariy/reklama parchalarini VIDEO ga, noto'g'ri VIDEO bo'lgan jonli
 * nutqni O'QITUVCHI ga qaytaradi. Xato bo'lsa matn o'zgarmaydi.
 */
export async function relabelMediaSegments(
  apiKey: string, text: string, subject: string, topic: string, onUsage?: (u: GeminiUsage) => void,
): Promise<{ text: string; changed: number; blocks?: string }> {
  if (!hasMarkers(text)) return { text, changed: 0 };
  const { lines, segs } = numberedLines(text, 200);
  if (segs.length < 5) return { text, changed: 0 };
  const prompt = `Sen dars audiosi transkriptini tahlil qiluvchi ekspertsan. Fan: ${subject || "—"}. Mavzu: ${topic || "—"}.
Quyida butun dars parchalari: indeks, vaqt (MM:SS), STT bergan manba, matn boshi. STT har 5 daqiqani alohida eshitgan,
shuning uchun darsda qo'yilgan VIDEO (ayniqsa O'ZBEKCHA DUBLYAJ qilingan YouTube rolik diktori) ko'pincha O'QITUVCHI
yoki TALABA deb xato belgilangan.

VAZIFA: darsda qo'yilgan barcha video/audio BLOKLARINI top.
- Blok boshlanishi: o'qituvchi video qo'yishini aytgan joydan keyin ("video ko'ramiz", "YouTube'dan ochaman",
  "qaranglar") yoki ingliz tilidagi/diktor nutqi, reklama boshlangan joy.
- Blok tugashi: o'qituvchi talabalarga qaytgan joy ("videodan nima xulosa chiqardinglar", "to'xtatamiz", "xo'p, endi...",
  talabaga savol). Keyingi video bloki bo'lsa — alohida blok.
- Dublyaj/diktor belgilari: uzluksiz ssenariy ma'ruza; "siz tushunib olganingizdek", "bugun siz bilib oladigan narsalar";
  kanal/obuna/reklama ("kanalimizga obuna bo'ling", noutbuk, sayt reklamasi); birinchi shaxsdagi begona hikoya
  ("men markaziy bankda ishlaganman"); o'xshatish va misollar bilan bir tekis hikoya, talabalarga murojaat yo'q.
- Bir necha soniyada TALABA/O'QITUVCHI tez almashib keladigan, gapi kesik qatorlar — bu bitta diktor nutqining xato
  bo'linishi, VIDEO blokiga kiradi.
- Diktor ham tinglovchiga "siz" deb murojaat qiladi — bu o'qituvchi degani EMAS. Video davomida o'qituvchi qisqa
  gapirib qo'ysa ham blokni bo'lma; blok o'qituvchi videoni to'xtatib darsga qaytgan joyda tugaydi.
- Video bo'lmagan darsda bloklar bo'sh bo'ladi — o'ylab topma.

JAVOB — faqat JSON, vaqtlar qatorlardagi MM:SS formatida:
{"video_blocks": [{"from": "MM:SS", "to": "MM:SS", "why": "<qisqa dalil>"}]}

PARCHALAR:
${lines}`;
  const raw = await callGemini(apiKey, prompt, { temperature: 0.1, maxTokens: 4096, timeoutMs: 120000, onUsage, model: "gemini-2.5-flash" }).catch(() => "");
  if (!raw) return { text, changed: 0 };
  try {
    let c = raw.trim();
    if (c.startsWith("```")) c = c.replace(/^```(?:\w+)?\s*/, "").replace(/`+$/, "").trim();
    const data = JSON.parse(c);
    const ranges: { from: number; to: number; who: Who }[] = [];
    const desc: string[] = [];
    for (const b of (Array.isArray(data.video_blocks) ? data.video_blocks : [])) {
      const from = parseClock(b?.from), to = parseClock(b?.to);
      if (from == null || to == null || to <= from) continue;
      ranges.push({ from, to, who: "media" });
      desc.push(`${fmtClock(from)}–${fmtClock(to)} (${String(b?.why || "").slice(0, 60)})`);
    }
    if (!ranges.length) return { text, changed: 0, blocks: "yo'q" };
    const r = relabelByTime(segs, ranges);
    return { ...r, blocks: desc.join("; ") };
  } catch {
    return { text, changed: 0 };
  }
}

// Files larger than this (raw bytes) can't go in an inline Gemini request
// (~20MB request cap). Above it we upload via the Files API and reference the
// file by URI instead.
const INLINE_AUDIO_LIMIT = 14 * 1024 * 1024;

export function transcriptionInstruction(courseType: string, topic: string): string {
  // 2026-09-28: ovoz manbasi yorlig'i + bo'lak ichidagi vaqt. Darsda qo'yilgan video diktori
  // o'qituvchi nutqi deb baholanmasligi va dars jarayoni (kim, qachon, qancha) ko'rinishi uchun.
  return `Sen dars audiosini matnga o'giruvchi transkriberisan. Sen REDAKTOR EMASSAN, faqat eshitgan narsangni so'zma-so'z yozasan va HAR BIR parcha kimdan/nimadan kelayotganini belgilaysan.

Kontekst: ${courseType || "umumiy ta'lim"}${topic ? ` darsi, mavzu: ${topic}` : ""}. Audio auditoriyadagi mikrofondan yozilgan.

VAZIFA: Audioyozuvdagi nutqni boshidan oxirigacha, aynan eshitganingdek yoz. Har bir parcha yangi qatorda, oldida vaqt va ovoz manbasi yorlig'i bo'lsin:
[MM:SS MANBA] matn

MANBA faqat quyidagilardan biri:
- O'QITUVCHI — dars o'tayotgan o'qituvchining jonli nutqi (odatda eng baland va eng ko'p gapiradigan ovoz).
- TALABA — talabalarning jonli savol-javobi, izohi (o'qituvchidan boshqa jonli ovoz).
- VIDEO — kolonka/kompyuterdan qo'yilgan yozib olingan audio yoki video: diktor ovozi, fon musiqasi, boshqa tildagi nutq, ovozi "studiya"/efir kabi tekis va tiniq eshitiladigan, auditoriyadagi jonli suhbatdan farq qiladigan nutq. O'qituvchi video ichidagi gapni takrorlasa yoki izohlasa — bu O'QITUVCHI.
MM:SS — shu audio parcha boshidan hisoblangan vaqt (00:00 dan boshlanadi). Manba o'zgarganda yoki har ~30–60 soniyada yangi qator och.

QAT'IY QOIDALAR:
1. HECH NIMA O'YLAB TOPMA — aniq eshitilmagan so'zni yozma yoki "[...]" qoldir. Bir gapni qayta-qayta takrorlama; loop'ga tushsang to'xta.
2. VIDEO parchasini ham eshitilgan tilda yoz (inglizcha bo'lsa inglizcha), tarjima qilma.
3. NOMLAR — brend va atamalarni asl holida yoz: Excel, Python, GitHub, API, SQL.
4. TALAFFUZ — faqat aniq xatolarni tuzat: payton→Python, vekent→backend.
5. FORMAT — faqat yuqoridagi qatorlar. Markdown YO'Q, izoh YO'Q. Instruksiya parchalarini ("Kontekst:", "VAZIFA:") qaytarma.
6. SHOVQIN/JIMLIK — nutq bo'lmasa, bo'sh javob qaytar.

Faqat yorliqli transkriptni qaytar, boshqa hech narsa qo'shma.`;
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
export async function uploadAudioToGeminiFiles(
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
    body: JSON.stringify({ file: { display_name: "tatuziyo-audio" } }),
  });
  if (!start.ok) {
    console.error("Gemini Files API start xatosi:", start.status, (await start.text().catch(() => "")).slice(0, 300));
    return null;
  }
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) { console.error("Gemini Files API: x-goog-upload-url sarlavhasi yo'q"); return null; }

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
  if (!up.ok) {
    console.error("Gemini Files API upload xatosi:", up.status, (await up.text().catch(() => "")).slice(0, 300));
    return null;
  }
  const upData = (await up.json()) as any;
  let file = upData?.file;
  if (!file?.name) { console.error("Gemini Files API: javobda file.name yo'q", JSON.stringify(upData).slice(0, 300)); return null; }

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
  if (state !== "ACTIVE" || !uri) {
    console.error("Gemini Files API: fayl ACTIVE bo'lmadi, holat:", state, "uri:", Boolean(uri));
    return null;
  }
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

// ═══════════════════════════════════════════════════════
// Token / xarajat hisobi (usageMetadata). Narxlar USD / 1M token, 2026-09 tarifi:
//   gemini-2.5-flash:      matn 0.30, audio 1.00, chiqish 2.50
//   gemini-2.5-flash-lite: matn 0.10, audio 0.30, chiqish 0.40
//   Batch API — 50%. thoughtsTokenCount chiqishga qo'shiladi (thinkingBudget 0, odatda 0).
// ═══════════════════════════════════════════════════════
export interface GeminiUsage { model: string; audioIn: number; textIn: number; out: number; batch: boolean }
const PRICE_PER_M: Record<string, { text: number; audio: number; out: number }> = {
  "gemini-2.5-flash": { text: 0.30, audio: 1.00, out: 2.50 },
  "gemini-2.5-flash-lite": { text: 0.10, audio: 0.30, out: 0.40 },
};
export function usageFrom(data: any, model: string, batch = false): GeminiUsage | null {
  const um = data?.usageMetadata;
  if (!um) return null;
  const promptTotal = Number(um.promptTokenCount || 0);
  let audio = 0;
  for (const d of (um.promptTokensDetails || [])) {
    if (String(d?.modality || "").toUpperCase() === "AUDIO") audio += Number(d.tokenCount || 0);
  }
  const out = Number(um.candidatesTokenCount || 0) + Number(um.thoughtsTokenCount || 0);
  const mv = String(data?.modelVersion || model || "").replace(/^models\//, "");
  return { model: mv || model, audioIn: audio, textIn: Math.max(0, promptTotal - audio), out, batch };
}
export function usageUsd(u: GeminiUsage): number {
  const key = Object.keys(PRICE_PER_M).sort((a, b) => b.length - a.length).find((k) => u.model.startsWith(k)) || "gemini-2.5-flash";
  const p = PRICE_PER_M[key];
  const usd = (u.textIn * p.text + u.audioIn * p.audio + u.out * p.out) / 1e6;
  return u.batch ? usd / 2 : usd;
}

export interface SttResult {
  transcript: string;
  model: string;
  /** Har bir pullik generateContent chaqiruvi (barcha model/temperature urinishlari). */
  usage?: GeminiUsage[];
  /** Model takrorlash sikliga tushdi (ikkala urinishda) — bo'lakni maydaroq bo'lib qayta urinish mumkin. */
  looped?: boolean;
  /** Hech bir model javob bermadi (4xx/5xx/istisno) — vaqtinchalik xato, keyinroq qayta urinish kerak. */
  httpError?: boolean;
  /** Oxirgi HTTP xatoning qisqa tavsifi (masalan "429: prepayment credits are depleted"). */
  errorDetail?: string;
}

/** Run a one-shot transcription generateContent call over the model fallback chain. */
async function runTranscription(
  apiKey: string,
  audioPart: Record<string, any>,
  instruction: string,
  maxOutputTokens: number,
  modelOverride?: string,
  temps: number[] = [0.3, 0.0]  // 2026-09-23: t=0 siklga ko'proq tushadi, avval 0.3
): Promise<SttResult> {
  const payload = {
    contents: [{ parts: [{ text: instruction }, audioPart] }],
    // Transcription needs no chain-of-thought; reasoning tokens would just eat
    // the output budget on the 2.5-flash thinking model.
    generationConfig: { temperature: 0.0, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
  };

  const models = modelOverride
    ? [modelOverride, ...GEMINI_MODELS.filter((m) => m !== modelOverride)]
    : GEMINI_MODELS;

  // Bitta generateContent chaqiruvi. `http:false` — 4xx/5xx yoki istisno (keyingi modelga).
  type Once = { http: boolean; text: string; reason: string; rawWords: number };
  let lastError = "";
  const usages: GeminiUsage[] = [];
  const once = async (model: string, temperature: number): Promise<Once> => {
    const body = { ...payload, generationConfig: { ...payload.generationConfig, temperature } };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      const res = await fetch(geminiUrl(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const bodyText = (await res.text().catch(() => "")).slice(0, 300);
        console.error("Gemini STT xatosi:", model, res.status, bodyText);
        let msg = "";
        try { msg = String(JSON.parse(bodyText)?.error?.message || ""); } catch { msg = bodyText; }
        lastError = `${res.status}: ${msg.replace(/s+/g, " ").slice(0, 160)}`;
        return { http: false, text: "", reason: "", rawWords: 0 };
      }
      const data = (await res.json()) as any;
      const uu = usageFrom(data, model);
      if (uu) usages.push(uu);
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      const reason = String(data?.candidates?.[0]?.finishReason || "");
      if (!raw) {
        console.error("Gemini STT bo'sh javob:", model, "t=" + temperature,
          "finishReason:", reason, "promptFeedback:", JSON.stringify(data?.promptFeedback || null).slice(0, 200));
      }
      return { http: true, text: cleanTranscriptChunk(raw), reason, rawWords: raw.split(/\s+/).filter(Boolean).length };
    } catch (e: any) {
      console.error("Gemini STT istisno:", model, e?.name, String(e?.message || e).slice(0, 200));
      lastError = `${e?.name || "xato"}: ${String(e?.message || e).slice(0, 160)}`;
      return { http: false, text: "", reason: "", rawWords: 0 };
    }
  };
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

  // 2026-09-15 tajribasi (80 daq ma'ruza, 10/5 daq bo'laklar):
  //  - temperature 0 da model savol-javob qismlarida takrorlash sikliga tushadi
  //    (MAX_TOKENS, "Odam. Odam. Odam."), cleanTranscriptChunk sikl(ni) yig'adi va
  //    faqat sikl boshigacha matn qoladi (10 925 → 194 so'z). temperature 0.3 da
  //    sikl yo'q (STOP, 323 so'z).
  //  - RECITATION (Gemini "matn takrorlash" filtri) bo'sh javob beradi, keshlanadi;
  //    boshqa temperature yoki boshqa model o'tadi.
  // Shuning uchun: avval t=0; sikl/bo'sh bo'lsa t=0.3 bilan qayta; so'z ko'prog'i olinadi.
  let anyHttpOk = false;
  for (const model of models) {
    const a = await once(model, temps[0]);
    if (!a.http) continue;
    anyHttpOk = true;
    const looped = a.reason === "MAX_TOKENS" || (a.rawWords > 0 && words(a.text) < a.rawWords * 0.5);
    const empty = !a.text;
    if (!looped && !empty) return { transcript: a.text, model, usage: usages };
    // Bitta temperature rejimi (yarmlar uchun): ikkinchi pullik urinish yo'q.
    if (temps.length < 2) { if (a.text) return { transcript: a.text, model, looped, usage: usages }; continue; }

    if (looped) console.warn("Gemini STT sikl:", model, `${a.rawWords} → ${words(a.text)} so'z, ${a.reason}; t=0.3 bilan qayta`);
    else if (a.reason !== "RECITATION" && a.reason !== "OTHER" && a.reason !== "STOP") continue;

    const b = await once(model, temps[1]);
    if (!b.http) { if (a.text) return { transcript: a.text, model, looped, usage: usages }; continue; }
    const bLooped = b.reason === "MAX_TOKENS" || (b.rawWords > 0 && words(b.text) < b.rawWords * 0.5);
    if (bLooped) console.warn("Gemini STT sikl (t=0.3 ham):", model, `${b.rawWords} → ${words(b.text)} so'z`);
    const best = words(b.text) >= words(a.text) ? b.text : a.text;
    if (best) return { transcript: best, model, looped: looped && bLooped, usage: usages };
  }
  return { transcript: "", model: "", httpError: !anyHttpOk, errorDetail: anyHttpOk ? undefined : lastError, usage: usages };
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
  modelOverride?: string,
  temps?: number[]
): Promise<SttResult> {
  const instruction = transcriptionInstruction(courseType, topic);

  // Small file → inline. Modest output budget is plenty for short clips.
  if (bytes.byteLength <= INLINE_AUDIO_LIMIT) {
    const audioPart = { inline_data: { mime_type: mimeType, data: bytesToBase64(bytes) } };
    return runTranscription(apiKey, audioPart, instruction, 8192, modelOverride, temps);
  }

  // Large file → Files API. Bigger output budget for long lessons.
  const uploaded = await uploadAudioToGeminiFiles(apiKey, bytes, mimeType);
  if (!uploaded) return { transcript: "", model: "", httpError: true, errorDetail: "Files API yuklash xatosi" };
  try {
    const audioPart = { file_data: { mime_type: mimeType, file_uri: uploaded.uri } };
    return await runTranscription(apiKey, audioPart, instruction, 32768, modelOverride, temps);
  } finally {
    await deleteGeminiFile(apiKey, uploaded.name);
  }
}

// ═══════════════════════════════════════════════════════
// Gemini Batch API — STT bo'laklari uchun (narx 50%, natija odatda daqiqalarda, 24 soatgacha)
//   POST models/{model}:batchGenerateContent  { batch: { displayName, inputConfig: { requests: { requests: [...] } } } }
//   GET  {batches/...}  → metadata.state (BATCH_STATE_* / JOB_STATE_*), response.inlinedResponses[]
//   Inline so'rovlar 20MB gacha — audio Files API URI (fileData) orqali beriladi, so'rov kichik.
// ═══════════════════════════════════════════════════════

export interface SttBatchItem { key: string; fileUri: string; mimeType: string }
export interface SttBatchChunk { text: string; reason: string; rawWords: number; error?: string; usage?: GeminiUsage }
export interface SttBatchStatus {
  state: string;              // masalan "JOB_STATE_SUCCEEDED" / "BATCH_STATE_PENDING"
  done: boolean;
  model: string;
  results: Map<string, SttBatchChunk>;  // metadata.key (bo'lak indeksi) → natija
  error?: string;
}

/** Batch job yaratadi, nomini qaytaradi ("batches/..."). Xato → istisno (Queue keyinroq qayta uradi). */
export async function createSttBatch(
  apiKey: string, model: string, items: SttBatchItem[], instruction: string, displayName: string,
): Promise<string> {
  const requests = items.map((it) => ({
    request: {
      contents: [{ parts: [{ text: instruction }, { fileData: { mimeType: it.mimeType, fileUri: it.fileUri } }] }],
      // t=0.3 — t=0 da ~45% bo'lak siklga tushdi (2026-09-22). 4096 token: 10 daqiqalik nutq ≤ ~3.5k,
      // sikl chiqindisi 8192 o'rniga 4096 da to'xtaydi (chiqish narxi 2 barobar kam).
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
    },
    metadata: { key: it.key },
  }));
  const body = { batch: { displayName, inputConfig: { requests: { requests } } } };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = String(JSON.parse(text)?.error?.message || msg); } catch { /* xom matn */ }
    throw new Error(`Gemini Batch yaratilmadi (${res.status}): ${msg.slice(0, 200)}`);
  }
  const data: any = JSON.parse(text);
  const name = String(data?.name || "");
  if (!name) throw new Error("Gemini Batch: javobda name yo'q");
  return name;
}

/** Job holati + (tayyor bo'lsa) bo'lak natijalari. */
export async function getSttBatch(apiKey: string, name: string): Promise<SttBatchStatus> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
    headers: { "x-goog-api-key": apiKey },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = String(JSON.parse(text)?.error?.message || msg); } catch { /* xom matn */ }
    throw new Error(`Gemini Batch holati olinmadi (${res.status}): ${msg.slice(0, 200)}`);
  }
  const data: any = JSON.parse(text);
  const state = String(data?.metadata?.state || data?.state || "");
  const done = Boolean(data?.done) || /SUCCEEDED|FAILED|CANCELLED|EXPIRED/.test(state);
  const model = String(data?.metadata?.model || "").replace(/^models\//, "");
  const results = new Map<string, SttBatchChunk>();
  const err = data?.error?.message ? String(data.error.message) : undefined;

  // Javob shakli: response.inlinedResponses (massiv) yoki response.inlinedResponses.inlinedResponses
  const resp = data?.response || {};
  let list: any[] = [];
  if (Array.isArray(resp.inlinedResponses)) list = resp.inlinedResponses;
  else if (Array.isArray(resp.inlinedResponses?.inlinedResponses)) list = resp.inlinedResponses.inlinedResponses;
  if (/SUCCEEDED/.test(state) && list.length === 0) {
    // Kutilmagan javob shakli — wrangler tail'da ko'rish uchun (responsesFile bo'lishi mumkin).
    console.error("Gemini Batch SUCCEEDED, lekin inlinedResponses bo'sh:", JSON.stringify(data).slice(0, 1500));
  }
  list.forEach((it: any, i: number) => {
    const key = String(it?.metadata?.key ?? i);
    if (it?.error) {
      results.set(key, { text: "", reason: "", rawWords: 0, error: String(it.error?.message || "xato") });
      return;
    }
    const cand = it?.response?.candidates?.[0];
    const raw = String(cand?.content?.parts?.map((p: any) => p?.text || "").join("") || "").trim();
    const reason = String(cand?.finishReason || "");
    const usage = usageFrom(it?.response, model || "gemini-2.5-flash", true) || undefined;
    results.set(key, { text: raw, reason, rawWords: raw.split(/\s+/).filter(Boolean).length, usage });
  });
  return { state, done, model, results, error: err };
}

export async function cancelSttBatch(apiKey: string, name: string): Promise<void> {
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}:cancel`, {
    method: "POST", headers: { "x-goog-api-key": apiKey },
  }).catch(() => {});
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

