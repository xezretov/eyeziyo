/**
 * AI Assistant — admin panelining ovozli AI yordamchisi (/ai-menu sahifasi).
 *
 * Endpoints (index.ts routerida ulanadi, hammasi requireAdmin ortida):
 *   POST /api/admin/ai/ask  — savol (matn) → D1 statistika kontekst → Gemini javob
 *   POST /api/admin/ai/tts  — matn → Gemini TTS → WAV audio
 *   POST /api/admin/ai/stt  — qisqa audio savol (base64 WAV) → matn
 */

import { callGemini } from "./gemini";

export interface Env {
  GEMINI_API_KEY: string;
  DB: D1Database;
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════════════════════
// Analytics context — savolga javob berish uchun D1'dan yig'iladi
// ═══════════════════════════════════════════════════════════════

/**
 * Per-teacher aggregates for a given time window. `sinceExpr` is an SQLite
 * datetime expression (e.g. "datetime('now','-7 day')") or null for all-time.
 */
async function teacherWindowStats(
  env: Env,
  instId: number | null,
  sinceExpr: string | null
): Promise<Map<number, any>> {
  const timeFilter = sinceExpr ? `AND l.created_at >= ${sinceExpr}` : "";
  const rows = await env.DB.prepare(`
    SELECT u.id, u.name, u.course_type,
           COUNT(l.id) AS lessons,
           COALESCE(SUM(l.duration_seconds), 0) AS duration_sec,
           ROUND(AVG(e.overall_score), 1) AS avg_overall,
           ROUND(AVG(e.topic_score), 1) AS avg_topic,
           ROUND(AVG(e.speech_score), 1) AS avg_speech,
           ROUND(AVG(e.method_score), 1) AS avg_method,
           ROUND(AVG(e.interaction_score), 1) AS avg_interaction,
           ROUND(AVG(e.feedback_score), 1) AS avg_feedback
    FROM users u
    JOIN lessons l ON l.user_id = u.id ${timeFilter}
    LEFT JOIN evaluations e ON e.lesson_id = l.id
    WHERE u.role = 'teacher' AND u.institution_id = ?
    GROUP BY u.id
  `).bind(instId).all();

  const map = new Map<number, any>();
  for (const r of rows.results as any[]) map.set(r.id as number, r);
  return map;
}

/** Build a compact JSON snapshot of the institution's analytics for the LLM. */
async function gatherContext(admin: any, env: Env): Promise<any> {
  const instId = admin.institution_id ?? null;

  const allTeachers = await env.DB.prepare(
    "SELECT id, name, course_type FROM users WHERE role = 'teacher' AND institution_id = ? ORDER BY name"
  ).bind(instId).all();

  const [week, month, allTime] = await Promise.all([
    teacherWindowStats(env, instId, "datetime('now','-7 day')"),
    teacherWindowStats(env, instId, "datetime('now','-30 day')"),
    teacherWindowStats(env, instId, null),
  ]);

  const windowOf = (m: Map<number, any>, id: number) => {
    const s = m.get(id);
    if (!s || !s.lessons) return null;
    return {
      darslar: s.lessons,
      daqiqa: Math.round((s.duration_sec as number) / 60),
      umumiy_ball: s.avg_overall ?? null,
      mavzu_terminologiya: s.avg_topic ?? null,
      nutq_akademik_tozalik: s.avg_speech ?? null,
      metodik_mahorat: s.avg_method ?? null,
      interaktivlik: s.avg_interaction ?? null,
      teskari_aloqa: s.avg_feedback ?? null,
    };
  };

  const teachers = (allTeachers.results as any[]).map((t) => ({
    ism: t.name,
    yonalish: t.course_type || "",
    bu_hafta: windowOf(week, t.id),
    bu_oy: windowOf(month, t.id),
    jami: windowOf(allTime, t.id),
  }));

  // Recent lessons — savollar ko'pincha oxirgi darslar haqida bo'ladi.
  const recent = await env.DB.prepare(`
    SELECT u.name AS teacher, l.topic, l.group_name, l.created_at,
           l.duration_seconds, e.overall_score, e.interaction_score
    FROM lessons l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN evaluations e ON e.lesson_id = l.id
    WHERE u.institution_id = ?
    ORDER BY l.created_at DESC LIMIT 15
  `).bind(instId).all();

  const studentCount = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND institution_id = ?"
  ).bind(instId).first();

  return {
    oqituvchilar: teachers,
    oxirgi_darslar: (recent.results as any[]).map((r) => ({
      oqituvchi: r.teacher,
      mavzu: r.topic || "—",
      guruh: r.group_name || "—",
      sana: r.created_at,
      daqiqa: Math.round(((r.duration_seconds as number) || 0) / 60),
      ball: r.overall_score ?? null,
      interaktivlik: r.interaction_score ?? null,
    })),
    jami_oquvchilar: studentCount?.c || 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/ai/ask
// ═══════════════════════════════════════════════════════════════

interface AskTurn {
  role: "user" | "assistant";
  content: string;
}

export async function handleAiAsk(request: Request, admin: any, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ detail: "Gemini API kaliti sozlanmagan" }, 503);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ detail: "JSON body kerak" }, 400);
  }

  const question = String(body?.question || "").trim().slice(0, 1000);
  if (!question) return json({ detail: "Savol bo'sh" }, 400);

  const history: AskTurn[] = Array.isArray(body?.history)
    ? body.history
        .filter((t: any) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .slice(-8)
        .map((t: any) => ({ role: t.role, content: String(t.content).slice(0, 1500) }))
    : [];

  const context = await gatherContext(admin, env);
  const historyText = history
    .map((t) => `${t.role === "user" ? "ADMIN" : "SEN"}: ${t.content}`)
    .join("\n");

  // SQLite datetime('now') is UTC — tell the model today's date so
  // "bu hafta / o'tgan hafta" savollarini to'g'ri talqin qiladi.
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Sen "Eyeziyo AI" — ta'lim markazi admin panelining ovozli AI tahlilchisisan. Admin senga dars sifati statistikasi haqida savol beradi.

BUGUNGI SANA: ${today}
ADMIN ISMI: ${admin.name || "Admin"}

MUASSASA STATISTIKASI (JSON):
${JSON.stringify(context)}

Izoh: "bu_hafta" = oxirgi 7 kun, "bu_oy" = oxirgi 30 kun. Ballar 0-100 oralig'ida. "null" — o'sha davrda baholangan dars yo'q degani.

${historyText ? `OLDINGI SUHBAT:\n${historyText}\n` : ""}
ADMIN SAVOLI: ${question}

QOIDALAR:
- Faqat yuqoridagi statistikaga asoslanib javob ber, o'ylab topma.
- O'zbek tilida, 2-5 gap. Aniq raqamlar va ismlar bilan.
- Javob ovozli o'qib eshittiriladi (TTS) — shuning uchun FAQAT toza matn: markdown, yulduzcha, jadval, ro'yxat belgilari YO'Q.
- Taqqoslash so'ralsa (masalan "kim eng zo'r"), g'olibni ayt va qisqa asosini ber (ball, dars soni).
- Ma'lumot yetarli bo'lmasa (masalan bu hafta hech kim dars o'tmagan bo'lsa), buni ochiq ayt.

Faqat javob matnini qaytar.`;

  const answer = (await callGemini(env.GEMINI_API_KEY, prompt, {
    temperature: 0.3,
    maxTokens: 1024,
    timeoutMs: 30000,
  })).trim();

  if (!answer) return json({ detail: "AI javob bera olmadi, qayta urinib ko'ring" }, 502);
  return json({ answer });
}

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/ai/tts — Gemini TTS → WAV
// ═══════════════════════════════════════════════════════════════

const TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
const TTS_VOICE = "Kore"; // tekis, neytral ayol ovozi — o'zbekchani yaxshi oladi

/** Wrap raw 16-bit PCM into a WAV container. */
function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  v.setUint32(40, pcm.length, true);

  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function handleAiTts(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ detail: "Gemini API kaliti sozlanmagan" }, 503);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ detail: "JSON body kerak" }, 400);
  }

  const text = String(body?.text || "").trim().slice(0, 1200);
  if (!text) return json({ detail: "Matn bo'sh" }, 400);

  const payload = {
    contents: [{ parts: [{ text: `O'zbek tilida, tabiiy va ravon ohangda o'qi: ${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
      },
    },
  };

  for (const model of TTS_MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (!res.ok) continue;

      const data = (await res.json()) as any;
      const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
      if (!part) continue;

      // mimeType odatda "audio/L16;codec=pcm;rate=24000" bo'ladi.
      const mime: string = part.inlineData.mimeType || "";
      const rateMatch = mime.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

      const pcm = base64ToBytes(part.inlineData.data);
      const wav = pcmToWav(pcm, sampleRate);

      return new Response(wav.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      continue;
    }
  }

  return json({ detail: "TTS ishlamadi, birozdan keyin qayta urinib ko'ring" }, 502);
}

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/ai/stt — mikrofon savolini matnga o'girish
// ═══════════════════════════════════════════════════════════════

export async function handleAiStt(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ detail: "Gemini API kaliti sozlanmagan" }, 503);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ detail: "JSON body kerak" }, 400);
  }

  const audio = String(body?.audio || "");
  const mime = String(body?.mime || "audio/wav");
  // base64 ~1.33x — 4MB base64 ≈ 3MB audio, qisqa savol uchun yetarli.
  if (!audio) return json({ detail: "Audio yo'q" }, 400);
  if (audio.length > 4 * 1024 * 1024) return json({ detail: "Audio juda uzun (maks ~1 daqiqa)" }, 413);

  const instruction = `Bu — ta'lim markazi adminining qisqa ovozli savoli (o'zbek tilida). Uni aynan eshitganingdek matnga o'gir. Faqat savol matnini qaytar: izoh, vaqt belgisi, markdown YO'Q. Nutq bo'lmasa bo'sh satr qaytar.`;

  const payload = {
    contents: [
      { parts: [{ text: instruction }, { inline_data: { mime_type: mime, data: audio } }] },
    ],
    generationConfig: { temperature: 0.0, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
  };

  for (const model of ["gemini-2.5-flash-lite", "gemini-2.5-flash"]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (text) return json({ text });
    } catch {
      continue;
    }
  }

  return json({ detail: "Savol tushunilmadi, qayta urinib ko'ring" }, 502);
}
