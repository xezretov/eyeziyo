/** Yozuvlar API: ro'yxat, detal, audio stream, qo'lda biriktirish, qayta ishlash. */
import { Env, json, err, mimeFor } from "./types";

const IN_PROGRESS = `'queued','downloading','stored','transcribing','analyzing'`;

export async function listRecordings(request: Request, env: Env): Promise<Response> {
  const u = new URL(request.url);
  const status  = u.searchParams.get("status") || "";
  const teacher = u.searchParams.get("teacher_id") || "";
  const subject = u.searchParams.get("subject_id") || "";
  const source  = u.searchParams.get("source_id") || "";
  const from    = u.searchParams.get("from") || "";
  const to      = u.searchParams.get("to") || "";
  const q       = (u.searchParams.get("q") || "").trim();
  const page    = Math.max(1, parseInt(u.searchParams.get("page") || "1", 10) || 1);
  const limit   = Math.min(100, Math.max(1, parseInt(u.searchParams.get("limit") || "25", 10) || 25));

  const where: string[] = ["1=1"];
  const args: any[] = [];
  // Status filtri: aniq status, "in_progress" guruhi, yoki (default) skipped'dan tashqari hammasi.
  if (status === "in_progress") where.push(`r.status IN (${IN_PROGRESS})`);
  else if (status)             { where.push("r.status = ?"); args.push(status); }
  else                           where.push("r.status != 'skipped'");
  if (teacher) { where.push("r.teacher_id = ?"); args.push(parseInt(teacher, 10)); }
  if (subject) { where.push("r.subject_id = ?"); args.push(parseInt(subject, 10)); }
  if (source)  { where.push("r.source_id = ?");  args.push(parseInt(source, 10)); }
  if (from)    { where.push("r.created_at >= ?"); args.push(from); }
  if (to)      { where.push("r.created_at <= ?"); args.push(to); }
  if (q)       { where.push("(r.topic LIKE ? OR t.full_name LIKE ? OR r.source_name LIKE ? OR s.display_name LIKE ? OR sub.name LIKE ? OR r.group_name LIKE ?)");
                 const like = `%${q}%`; args.push(like, like, like, like, like, like); }
  const w = where.join(" AND ");

  const joins = `
       FROM recordings r
       LEFT JOIN teachers t   ON t.id  = r.teacher_id
       LEFT JOIN subjects sub ON sub.id = r.subject_id
       LEFT JOIN sources s    ON s.id  = r.source_id`;

  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS n ${joins} WHERE ${w}`
  ).bind(...args).first<{ n: number }>();

  const rows = await env.DB.prepare(
    `SELECT r.id, r.recording_id, r.status, r.error, r.profile, r.container,
            r.size_bytes, r.duration_seconds, r.completeness, r.gap_seconds_total,
            r.started_at, r.finalized_at, r.created_at, r.topic, r.group_name,
            r.source_name, s.display_name AS source_display,
            t.id AS teacher_id, t.full_name AS teacher_name,
            sub.id AS subject_id, sub.name AS subject_name,
            a.overall_score, a.topic_score, a.speech_score, a.method_score,
            a.interaction_score, a.feedback_score,
            tr.word_count
       ${joins}
       LEFT JOIN analyses a     ON a.recording_id = r.id
       LEFT JOIN transcripts tr ON tr.recording_id = r.id
      WHERE ${w}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`
  ).bind(...args, limit, (page - 1) * limit).all();

  // Status bo'yicha umumiy sonlar — filtr pill'lari uchun.
  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM recordings GROUP BY status`
  ).all();

  return json({
    items: rows.results, total: total?.n ?? 0, page, limit,
    counts: Object.fromEntries((counts.results as any[]).map((r) => [r.status, r.n])),
  });
}

export async function getRecording(env: Env, id: number): Promise<Response> {
  const r = await env.DB.prepare(
    `SELECT r.*, t.full_name AS teacher_name, sub.name AS subject_name,
            s.display_name AS source_display
       FROM recordings r
       LEFT JOIN teachers t   ON t.id  = r.teacher_id
       LEFT JOIN subjects sub ON sub.id = r.subject_id
       LEFT JOIN sources s    ON s.id  = r.source_id
      WHERE r.id = ?`
  ).bind(id).first<any>();
  if (!r) return err("Topilmadi", 404);

  // Xom payload'ni klientga bermaymiz — audit uchun bazada qoladi.
  delete r.payload;

  const tr = await env.DB.prepare(
    `SELECT text, char_count, word_count, model FROM transcripts WHERE recording_id = ?`
  ).bind(id).first<any>();

  const an = await env.DB.prepare(
    `SELECT * FROM analyses WHERE recording_id = ?`
  ).bind(id).first<any>();
  if (an) {
    try {
      an.strengths    = JSON.parse(an.strengths || "[]");
      an.improvements = JSON.parse(an.improvements || "[]");
      an.advice       = JSON.parse(an.advice || "[]");
    } catch { an.strengths = []; an.improvements = []; an.advice = []; }
  }

  const ev = await env.DB.prepare(
    `SELECT stage, status, message, duration_ms, created_at
       FROM processing_events WHERE recording_id = ? ORDER BY id DESC LIMIT 50`
  ).bind(id).all();

  return json({ recording: r, transcript: tr || null, analysis: an || null, events: ev.results });
}

/** R2 dan audio — Range so'rovlarini qo'llab-quvvatlaydi (player uchun shart). */
export async function streamAudio(request: Request, env: Env, id: number): Promise<Response> {
  const r = await env.DB.prepare(
    `SELECT r2_key, container, codec FROM recordings WHERE id = ?`
  ).bind(id).first<any>();
  if (!r?.r2_key) return err("Audio saqlanmagan", 404);

  const range = request.headers.get("Range");
  const obj = await env.AUDIO.get(r.r2_key, range ? { range: request.headers } : undefined);
  if (!obj) return err("R2 da topilmadi", 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Content-Type", mimeFor(r.container, r.codec));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Access-Control-Allow-Origin", "*");

  if (obj.range && "offset" in obj.range) {
    const start = obj.range.offset ?? 0;
    const len = (obj.range as any).length ?? obj.size - start;
    headers.set("Content-Range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

/**
 * Qo'lda biriktirish — o'qituvchi + fan + mavzu.
 * Transkript tayyor bo'lsa, biriktirilgandan keyin baholash avtomatik boshlanadi.
 */
export async function assignRecording(
  request: Request, env: Env, id: number, userId: number,
): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const teacherId = body.teacher_id ? parseInt(body.teacher_id, 10) : null;
  const subjectId = body.subject_id ? parseInt(body.subject_id, 10) : null;
  const topic = String(body.topic || "").trim();
  const group = String(body.group_name || "").trim();

  if (!teacherId) return err("O'qituvchi tanlanmagan", 400);
  if (!subjectId) return err("Fan tanlanmagan", 400);
  if (!topic)     return err("Mavzu kiritilmagan", 400);

  const rec = await env.DB.prepare(`SELECT status FROM recordings WHERE id = ?`)
    .bind(id).first<{ status: string }>();
  if (!rec) return err("Topilmadi", 404);
  if (rec.status === "skipped") return err("Bu artifact qayta ishlanmaydi (profil mos emas)", 400);

  await env.DB.prepare(
    `UPDATE recordings SET teacher_id = ?, subject_id = ?, topic = ?, group_name = ?,
            assigned_by = ?, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).bind(teacherId, subjectId, topic, group, userId, id).run();

  const hasTranscript = await env.DB.prepare(
    `SELECT 1 AS x FROM transcripts WHERE recording_id = ?`
  ).bind(id).first();

  if (hasTranscript) {
    await env.DB.prepare(`UPDATE recordings SET status = 'analyzing' WHERE id = ?`).bind(id).run();
    await env.JOBS.send({ type: "analyze", recordingId: id });
    return json({ ok: true, queued: "analyze" });
  }
  return json({ ok: true, queued: null, note: "Transkript tayyor bo'lgach baholanadi" });
}

/**
 * Qayta ishlash: from=download (butun konveyer, audiotap'dan qayta yuklab olinadi),
 * from=transcribe (R2 dagi audio bilan STT + baholash), from=analyze (faqat baholash).
 */
export async function reprocess(request: Request, env: Env, id: number): Promise<Response> {
  const from = new URL(request.url).searchParams.get("from") || "download";
  const r = await env.DB.prepare(`SELECT id, r2_key FROM recordings WHERE id = ?`).bind(id).first<any>();
  if (!r) return err("Topilmadi", 404);

  if (from === "analyze") {
    await env.DB.prepare(`UPDATE recordings SET status='analyzing', error='' WHERE id = ?`).bind(id).run();
    await env.JOBS.send({ type: "analyze", recordingId: id });
  } else if (from === "transcribe" && r.r2_key) {
    await env.DB.prepare(`UPDATE recordings SET status='queued', error='', attempts=0 WHERE id = ?`).bind(id).run();
    await env.JOBS.send({ type: "ingest", recordingId: id });
  } else {
    // r2_key tozalanadi — ingest audiotap'dan qaytadan yuklab oladi.
    await env.DB.prepare(`UPDATE recordings SET status='queued', error='', attempts=0, r2_key='' WHERE id = ?`).bind(id).run();
    await env.JOBS.send({ type: "ingest", recordingId: id });
  }
  return json({ ok: true, from });
}

export async function deleteRecording(env: Env, id: number): Promise<Response> {
  const r = await env.DB.prepare(`SELECT r2_key FROM recordings WHERE id = ?`).bind(id).first<any>();
  if (!r) return err("Topilmadi", 404);
  if (r.r2_key) await env.AUDIO.delete(r.r2_key).catch(() => {});
  await env.DB.prepare(`DELETE FROM recordings WHERE id = ?`).bind(id).run();  // CASCADE
  return json({ ok: true });
}
