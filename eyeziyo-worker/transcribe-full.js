/**
 * Full-file single-pass transcription via the Gemini File API.
 *
 * Unlike test-transcribe.js (which splits into 12s chunks for real-time
 * streaming), this uploads the WHOLE audio and transcribes it in ONE request,
 * giving the model full context — far cleaner proper nouns, dates and no
 * chunk-boundary cuts or cross-chunk loops.
 *
 * Usage:
 *   node transcribe-full.js <audio> --course="..." --topic="..." [--glossary=1]
 *                            [--model=gemini-2.5-flash] --out=out.txt --key=...
 */
const fs = require("fs");

const args = process.argv.slice(2);
const audioPath = args.find((a) => !a.startsWith("--"));
const flag = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const course = flag("course", "Tarix");
const topic = flag("topic", "");
const model = flag("model", "gemini-2.5-flash");
const outFile = flag("out", "");
const useGlossary = flag("glossary", "0") === "1";
const KEY = flag("key", process.env.GEMINI_API_KEY || "");

if (!audioPath || !fs.existsSync(audioPath)) { console.error("Audio topilmadi:", audioPath); process.exit(1); }
if (!KEY) { console.error("--key=... yoki GEMINI_API_KEY kerak"); process.exit(1); }

const mimeFor = (p) =>
  p.endsWith(".flac") ? "audio/flac" :
  p.endsWith(".mp3") ? "audio/mp3" :
  p.endsWith(".m4a") ? "audio/mp4" :
  p.endsWith(".ogg") ? "audio/ogg" : "audio/wav";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = "https://generativelanguage.googleapis.com";

// ─── File API: resumable upload ──────────────────────────────
async function uploadFile(path) {
  const bytes = fs.readFileSync(path);
  const mime = mimeFor(path);
  // 1. start
  const startRes = await fetch(`${base}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": KEY,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "lesson-audio" } }),
  });
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error(`upload start failed: ${startRes.status} ${await startRes.text()}`);

  // 2. upload + finalize
  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  const info = await upRes.json();
  let file = info.file;
  if (!file) throw new Error(`upload failed: ${JSON.stringify(info)}`);

  // 3. wait until ACTIVE
  while (file.state === "PROCESSING") {
    await sleep(2000);
    const g = await fetch(`${base}/v1beta/${file.name}`, { headers: { "x-goog-api-key": KEY } });
    file = await g.json();
  }
  if (file.state !== "ACTIVE") throw new Error(`file not active: ${file.state}`);
  return { uri: file.uri, mime, name: file.name };
}

async function deleteFile(name) {
  try { await fetch(`${base}/v1beta/${name}`, { method: "DELETE", headers: { "x-goog-api-key": KEY } }); } catch {}
}

// ─── Gemini text call (glossary) ─────────────────────────────
async function genText(prompt, maxTokens) {
  const r = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function generateGlossary() {
  const prompt = `Sen speech-to-text aniqligini oshirish uchun lug'at tuzuvchisan.
KURS: ${course}
MAVZU: ${topic}
Shu mavzudagi darsda uchrashi mumkin bo'lgan ATOQLI OTLAR (shaxs, joy, sulola), atamalar va sanalarni ro'yxatla.
JAVOB FAQAT JSON, faqat so'zlar (tavsifsiz), 30-50 ta:
{"terms": ["Movarounnahr", "Tug'luq Temur"]}`;
  const raw = await genText(prompt, 2048);
  try {
    let c = raw.trim().replace(/^```(?:\w+)?\s*/, "").replace(/`+$/, "").trim();
    const d = JSON.parse(c);
    return [...new Set((d.terms || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 60).join(", ");
  } catch { return ""; }
}

// ─── Full-file transcription ─────────────────────────────────
async function transcribeFull(file, glossary) {
  const glossaryBlock = glossary
    ? `\nMAVZU LUG'ATI (atoqli ot, joy/shaxs nomi, atama — shu darsda uchraydi):\n${glossary}\nAgar shu so'zlarga o'xshash narsa eshitsang, AYNAN lug'atdagidek yoz.\n`
    : "";

  const prompt = `Sen professional o'zbek tilidagi nutqni matnga o'giruvchisan. Quyidagi to'liq dars audioyozuvini SO'ZMA-SO'Z, boshidan oxirigacha transkripsiya qil.

DARS: ${course}${topic ? ` — ${topic}` : ""}
${glossaryBlock}
QAT'IY QOIDALAR:
1. SO'ZMA-SO'Z yoz — o'qituvchi aytgan har bir gapni, aynan eshitilganidek. Hech narsani qisqartirma, umumlashtirma yoki tashlab ketma.
2. HECH NIMA O'YLAB TOPMA — darslikdan yoki bilimingdan gap qo'shma. Faqat audioda bor narsani yoz.
3. SANALAR VA RAQAMLARNI diqqat bilan eshit: "XIV asr", "1336-yil", "50-60-yillar" — asr va yilni adashtirма.
4. Inglizcha/xorijiy atama va nomlarni asl holida yoz.
5. Tinish belgilarini to'g'ri qo'y (nuqta, vergul, savol). Gaplarni mantiqiy abzatslarga ajrat.
6. Vaqt markerlari (00:05), izoh, markdown YO'Q. Faqat toza transkript matni.
7. Agar biror joy noaniq eshitilsa, eng yaqin ehtimoliy so'zni yoz, lekin gapni buzma.

Faqat to'liq transkriptni qaytar.`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { fileData: { mimeType: file.mime, fileUri: file.uri } }] }],
    generationConfig: { temperature: 0.0, maxOutputTokens: 28000, thinkingConfig: { thinkingBudget: 0 } },
  });

  // Retry transient 503 (overloaded) / 429 with exponential backoff.
  const maxTries = 6;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const r = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body,
    });
    const j = await r.json();
    if (r.ok) {
      const cand = j?.candidates?.[0];
      return { text: cand?.content?.parts?.[0]?.text || "", finish: cand?.finishReason, usage: j?.usageMetadata };
    }
    if ((r.status === 503 || r.status === 429) && attempt < maxTries) {
      const wait = Math.min(60000, 5000 * Math.pow(2, attempt - 1)); // 5,10,20,40,60s
      process.stdout.write(`[${r.status} retry ${attempt}/${maxTries} in ${wait / 1000}s] `);
      await sleep(wait);
      continue;
    }
    throw new Error(`generateContent ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────
(async () => {
  console.log("Audio:", audioPath, `(${(fs.statSync(audioPath).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log("Model:", model, "| Course:", course, "| Topic:", topic || "(none)");

  let glossary = "";
  if (useGlossary) {
    process.stdout.write("Lug'at... ");
    glossary = await generateGlossary();
    console.log(glossary ? `${glossary.split(",").length} term` : "(bo'sh)");
  }

  process.stdout.write("Yuklanmoqda (File API)... ");
  const t0 = Date.now();
  const file = await uploadFile(audioPath);
  console.log(`ACTIVE (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  process.stdout.write("Transkripsiya (single-pass)... ");
  const t1 = Date.now();
  const { text, finish, usage } = await transcribeFull(file, glossary);
  console.log(`${((Date.now() - t1) / 1000).toFixed(1)}s | finish=${finish} | out=${usage?.candidatesTokenCount} tok`);
  await deleteFile(file.name);

  console.log("\n─── TO'LIQ TRANSKRIPT ───\n");
  console.log(text);
  if (outFile) { fs.writeFileSync(outFile, text); console.log("\n→ Saqlandi:", outFile); }
})().catch((e) => { console.error("XATO:", e.message); process.exit(1); });
