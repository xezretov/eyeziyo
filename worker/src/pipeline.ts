/**
 * Qayta ishlash konveyeri (Queue consumer ichida ishlaydi).
 *
 *   ingest:  download_url → (checksum) → R2 → Gemini STT → transcripts
 *            → status = awaiting_assignment (yoki kontekst bo'lsa analyze'ga)
 *   analyze: transcript + qo'lda biriktirilgan fan/mavzu → Gemini 5 mezon
 *            → analyses → status = done
 *
 * NIMA UCHUN IKKI BOSQICH: o'qituvchi/fan/mavzu QO'LDA biriktiriladi, ammo
 * baholash prompti aynan shu kontekstni talab qiladi (topic_score fanga
 * mosligini o'lchaydi). Shuning uchun STT darhol ishlaydi, baholash esa
 * admin biriktirgandan keyin ishga tushadi.
 *
 * ESLATMA: Workers'da ffmpeg yo'q — audioni kesib/konvert qilib bo'lmaydi.
 * Butun fayl Gemini'ga yuboriladi: 14MB gacha inline, kattasi Files API
 * orqali (gemini.ts:transcribeAudioFile hal qiladi).
 */
import { Env, Job, mimeFor, sha256Hex, logEvent, setStatus } from "./types";
import { transcribeAudioFile, polishTranscript, evaluateLesson } from "./gemini";

function resolveDownloadUrl(rawUrl: string, baseUrl?: string): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    // Payload allaqachon tashqi manzil bergan bo'lsa (masalan Tailscale *.ts.net) —
    // o'zgartirmaymiz. Faqat localhost / xususiy IP bo'lsa AUDIOTAP_BASE_URL bilan almashtiriladi.
    const isLocal = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname);
    if (!isLocal) return rawUrl;
    if (!baseUrl || /localhost|127\.0\.0\.1/.test(baseUrl)) return rawUrl;
    const base = new URL(baseUrl);
    const basePath = base.pathname.replace(/\/$/, "");
    let path = u.pathname;
    // Ikkalasida ham "/api" bo'lsa ikki marta qo'shilib ketmasin.
    if (basePath.endsWith("/api") && path.startsWith("/api/")) path = path.slice(4);
    return `${base.origin}${basePath}${path}${u.search}`;
  } catch { return null; }
}

export async function runJob(job: Job, env: Env): Promise<void> {
  if (job.type === "ingest") return ingest(env, job.recordingId);
  if (job.type === "analyze") return analyze(env, job.recordingId);
}

// ── 1-bosqich: yuklab olish + STT ──
async function ingest(env: Env, id: number): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT * FROM recordings WHERE id = ?`
  ).bind(id).first<any>();
  if (!row) return;
  if (row.status === "done" || row.status === "skipped") return;

  await env.DB.prepare(
    `UPDATE recordings SET attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(id).run();

  // ── Yuklab olish (yoki R2 dagi nusxadan foydalanish) ──
  let bytes: Uint8Array;
  const t0 = Date.now();
  try {
    await setStatus(env.DB, id, "downloading");
    await logEvent(env.DB, id, "download", "start");

    const maxBytes = (parseInt(env.MAX_INGEST_MB || "90", 10) || 90) * 1024 * 1024;

    // STT bosqichida yiqilgan retry — audio allaqachon R2 da, audiotap'dan
    // qayta yuklab olmaymiz (vaqt + trafik tejaladi).
    let buf: ArrayBuffer | null = null;
    let key: string = row.r2_key || "";
    if (key) {
      const obj = await env.AUDIO.get(key).catch(() => null);
      if (obj) buf = await obj.arrayBuffer();
    }

    if (buf) {
      await logEvent(env.DB, id, "download", "ok",
        `R2 dan olindi, ${Math.round(buf.byteLength / 1024)}KB (qayta yuklanmadi)`, Date.now() - t0);
    } else {
      if (row.size_bytes && row.size_bytes > maxBytes) {
        throw new Error(`Fayl juda katta: ${Math.round(row.size_bytes / 1048576)}MB > ${maxBytes / 1048576}MB`);
      }

      const url = resolveDownloadUrl(row.download_url, env.AUDIOTAP_BASE_URL);
      if (!url) throw new Error("download_url yaroqsiz");

      // Audiotap /download 307 → presigned URL qaytaradi; fetch kuzatib boradi.
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`Yuklab olish xatosi: HTTP ${res.status}`);

      buf = await res.arrayBuffer();
      if (buf.byteLength === 0) throw new Error("Bo'sh fayl");
      if (buf.byteLength > maxBytes) throw new Error(`Fayl juda katta: ${Math.round(buf.byteLength / 1048576)}MB`);

      // Checksum tekshiruvi (audiotap bergan bo'lsa).
      if (row.checksum_sha256) {
        const actual = await sha256Hex(buf);
        if (actual.toLowerCase() !== String(row.checksum_sha256).toLowerCase()) {
          throw new Error("SHA-256 mos kelmadi — fayl buzilgan");
        }
      }

      key = `recordings/${row.recording_id || id}/${row.profile || "default"}.${row.container || "bin"}`;
      await env.AUDIO.put(key, buf, {
        httpMetadata: { contentType: mimeFor(row.container, row.codec) },
        customMetadata: { recordingId: String(id), eventId: String(row.event_id) },
      });
      await logEvent(env.DB, id, "download", "ok", `${Math.round(buf.byteLength / 1024)}KB`, Date.now() - t0);
    }

    bytes = new Uint8Array(buf);
    await env.DB.prepare(
      `UPDATE recordings SET r2_key = ?, size_bytes = ?, status = 'stored',
              error = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(key, buf.byteLength, id).run();
  } catch (e: any) {
    const msg = e?.message || String(e);
    await setStatus(env.DB, id, "failed", msg);
    await logEvent(env.DB, id, "download", "error", msg, Date.now() - t0);
    throw e;  // Queue retry qilsin
  }

  // ── STT ──
  const t1 = Date.now();
  try {
    await setStatus(env.DB, id, "transcribing");
    await logEvent(env.DB, id, "transcribe", "start");

    // Kontekst hali biriktirilmagan bo'lishi mumkin — bo'sh bo'lsa ham STT
    // ishlaydi, shunchaki termin tanish aniqligi bir oz pastroq bo'ladi.
    const ctx = await loadContext(env, id);

    // GEMINI_MODEL birinchi sinaladi, ishlamasa gemini.ts dagi zanjir davom etadi.
    const { transcript, model } = await transcribeAudioFile(
      env.GEMINI_API_KEY, bytes, mimeFor(row.container, row.codec),
      ctx.subject, ctx.topic, env.GEMINI_MODEL,
    );
    if (!transcript || transcript.trim().length < 10) {
      throw new Error("Transkript bo'sh — audio jim yoki STT ishlamadi");
    }

    const polished = await polishTranscript(env.GEMINI_API_KEY, transcript, ctx.subject, ctx.topic)
      .catch(() => transcript);
    const text = polished || transcript;

    await env.DB.prepare(
      `INSERT INTO transcripts (recording_id, text, char_count, word_count, model)
       VALUES (?,?,?,?,?)
       ON CONFLICT(recording_id) DO UPDATE SET
         text = excluded.text, char_count = excluded.char_count,
         word_count = excluded.word_count, model = excluded.model`
    ).bind(id, text, text.length, text.split(/\s+/).filter(Boolean).length, model).run();

    await logEvent(env.DB, id, "transcribe", "ok", `${text.length} belgi, ${model}`, Date.now() - t1);

    // Kontekst allaqachon biriktirilgan bo'lsa darhol baholaymiz.
    if (ctx.assigned) {
      await setStatus(env.DB, id, "analyzing");
      await env.JOBS.send({ type: "analyze", recordingId: id });
    } else {
      await setStatus(env.DB, id, "awaiting_assignment");
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    await setStatus(env.DB, id, "failed", msg);
    await logEvent(env.DB, id, "transcribe", "error", msg, Date.now() - t1);
    throw e;
  }
}

// ── 2-bosqich: AI baholash (5 mezon) ──
async function analyze(env: Env, id: number): Promise<void> {
  const t0 = Date.now();
  try {
    await setStatus(env.DB, id, "analyzing");
    await logEvent(env.DB, id, "analyze", "start");

    const tr = await env.DB.prepare(
      `SELECT text FROM transcripts WHERE recording_id = ?`
    ).bind(id).first<{ text: string }>();
    if (!tr?.text) throw new Error("Transkript topilmadi");

    const row = await env.DB.prepare(
      `SELECT duration_seconds FROM recordings WHERE id = ?`
    ).bind(id).first<{ duration_seconds: number }>();
    const ctx = await loadContext(env, id);

    const ev = await evaluateLesson(
      env.GEMINI_API_KEY, tr.text, ctx.subject, ctx.topic,
      Math.max(1, Math.round((row?.duration_seconds || 0) / 60)),
    );
    // Gemini ishlamay qolsa evaluateLesson bo'sh (hamma ball 0) natija qaytaradi.
    // Buni bazaga yozmaymiz — xato deb belgilab retry'ga tashlaymiz.
    if (!ev.summary && ev.overall_score === 0) {
      throw new Error("AI baholash bo'sh javob qaytardi (Gemini xatosi?)");
    }

    await env.DB.prepare(
      `INSERT INTO analyses (
         recording_id, overall_score, topic_score, speech_score, method_score,
         interaction_score, feedback_score, summary, strengths, improvements, advice, model
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(recording_id) DO UPDATE SET
         overall_score = excluded.overall_score, topic_score = excluded.topic_score,
         speech_score = excluded.speech_score, method_score = excluded.method_score,
         interaction_score = excluded.interaction_score, feedback_score = excluded.feedback_score,
         summary = excluded.summary, strengths = excluded.strengths,
         improvements = excluded.improvements, advice = excluded.advice,
         model = excluded.model, created_at = CURRENT_TIMESTAMP`
    ).bind(
      id, ev.overall_score, ev.topic_score, ev.speech_score, ev.method_score,
      ev.interaction_score, ev.feedback_score, ev.summary,
      JSON.stringify(ev.strengths), JSON.stringify(ev.improvements),
      JSON.stringify(ev.advice), ev.model || env.GEMINI_MODEL || "",
    ).run();

    await setStatus(env.DB, id, "done");
    await logEvent(env.DB, id, "analyze", "ok", `ball=${ev.overall_score}, ${ev.model || ""}`, Date.now() - t0);
  } catch (e: any) {
    const msg = e?.message || String(e);
    await setStatus(env.DB, id, "failed", msg);
    await logEvent(env.DB, id, "analyze", "error", msg, Date.now() - t0);
    throw e;
  }
}

async function loadContext(env: Env, id: number): Promise<{ subject: string; topic: string; assigned: boolean }> {
  const r = await env.DB.prepare(
    `SELECT r.topic, r.teacher_id, s.name AS subject
       FROM recordings r LEFT JOIN subjects s ON s.id = r.subject_id
      WHERE r.id = ?`
  ).bind(id).first<any>();
  return {
    subject: r?.subject || "Aniqlanmagan fan",
    topic: r?.topic || "Aniqlanmagan mavzu",
    assigned: Boolean(r?.teacher_id && r?.subject && r?.topic),
  };
}
