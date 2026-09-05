/**
 * Yozuvlar API: ro'yxat, detal, audio stream, qo'lda biriktirish, qayta ishlash.
 *
 * O'qituvchi = users (role='teacher'), fan = subjects, guruh = groups_v2 —
 * eyeziyo admin ma'lumotnomasi. Baholangan yozuv `lessons` + `evaluations`
 * ga yoziladi (recordings.lesson_id), shuning uchun dashboard, o'qituvchi
 * profili, dars detali admin-web bilan bir xil ishlaydi.
 */
import { Env, json, err, mimeFor } from "./types";

const IN_PROGRESS = `'queued','downloading','stored','transcribing','analyzing'`;

const JOINS = `
       FROM recordings r
       LEFT JOIN users u        ON u.id  = r.teacher_id
       LEFT JOIN subjects sub   ON sub.id = r.subject_id
       LEFT JOIN groups_v2 g    ON g.id  = r.group_id
       LEFT JOIN sources s      ON s.id  = r.source_id
       LEFT JOIN lessons l      ON l.id  = r.lesson_id
       LEFT JOIN evaluations e  ON e.lesson_id = l.id`;

export async function listRecordings(request: Request, env: Env): Promise<Response> {
  const q0 = new URL(request.url);
  const status  = q0.searchParams.get("status") || "";
  const teacher = q0.searchParams.get("teacher_id") || "";
  const subject = q0.searchParams.get("subject_id") || "";
  const source  = q0.searchParams.get("source_id") || "";
  const q       = (q0.searchParams.get("q") || "").trim();
  const page    = Math.max(1, parseInt(q0.searchParams.get("page") || "1", 10) || 1);
  const limit   = Math.min(100, Math.max(1, parseInt(q0.searchParams.get("limit") || "25", 10) || 25));

  const where: string[] = ["1=1"];
  const args: any[] = [];
  if (status === "in_progress") where.push(`r.status IN (${IN_PROGRESS})`);
  else if (status)             { where.push("r.status = ?"); args.push(status); }
  else                           where.push("r.status != 'skipped'");
  if (teacher) { where.push("r.teacher_id = ?"); args.push(parseInt(teacher, 10)); }
  if (subject) { where.push("r.subject_id = ?"); args.push(parseInt(subject, 10)); }
  if (source)  { where.push("r.source_id = ?");  args.push(parseInt(source, 10)); }
  if (q)       { where.push("(r.topic LIKE ? OR u.name LIKE ? OR r.source_name LIKE ? OR s.display_name LIKE ? OR sub.name LIKE ? OR r.group_name LIKE ?)");
                 const like = `%${q}%`; args.push(like, like, like, like, like, like); }
  const w = where.join(" AND ");

  const total = await env.DB.prepare(`SELECT COUNT(*) AS n ${JOINS} WHERE ${w}`)
    .bind(...args).first<{ n: number }>();

  const rows = await env.DB.prepare(
    `SELECT r.id, r.recording_id, r.status, r.error, r.profile, r.container,
            r.size_bytes, r.duration_seconds, r.completeness, r.gap_seconds_total,
            r.started_at, r.finalized_at, r.created_at, r.topic, r.group_name, r.lesson_id,
            r.source_name, s.display_name AS source_display,
            u.id AS teacher_id, u.name AS teacher_name,
            sub.id AS subject_id, sub.name AS subject_name,
            e.overall_score, e.topic_score, e.speech_score, e.method_score,
            e.interaction_score, e.feedback_score,
            tr.word_count
       ${JOINS}
       LEFT JOIN transcripts tr ON tr.recording_id = r.id
      WHERE ${w}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`
  ).bind(...args, limit, (page - 1) * limit).all();

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
    `SELECT r.*, u.name AS teacher_name, u.email AS teacher_email, sub.name AS subject_name,
            g.name AS group_display, s.display_name AS source_display
       FROM recordings r
       LEFT JOIN users u      ON u.id  = r.teacher_id
       LEFT JOIN subjects sub ON sub.id = r.subject_id
       LEFT JOIN groups_v2 g  ON g.id  = r.group_id
       LEFT JOIN sources s    ON s.id  = r.source_id
      WHERE r.id = ?`
  ).bind(id).first<any>();
  if (!r) return err("Topilmadi", 404);
  delete r.payload;   // xom JSON audit uchun bazada qoladi

  const tr = await env.DB.prepare(
    `SELECT text, char_count, word_count, model FROM transcripts WHERE recording_id = ?`
  ).bind(id).first<any>();

  let an: any = null;
  if (r.lesson_id) {
    an = await env.DB.prepare(`SELECT * FROM evaluations WHERE lesson_id = ?`).bind(r.lesson_id).first<any>();
    if (an) {
      try {
        an.strengths    = JSON.parse(an.strengths || "[]");
        an.improvements = JSON.parse(an.improvements || "[]");
        an.advice       = JSON.parse(an.advice || "[]");
      } catch { an.strengths = []; an.improvements = []; an.advice = []; }
    }
  }

  const ev = await env.DB.prepare(
    `SELECT stage, status, message, duration_ms, created_at
       FROM processing_events WHERE recording_id = ? ORDER BY id DESC LIMIT 50`
  ).bind(id).all();

  return json({ recording: r, transcript: tr || null, analysis: an, events: ev.results });
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
 * Qo'lda biriktirish — o'qituvchi (users) + fan (subjects) + guruh (groups_v2 yoki matn) + mavzu.
 * Transkript tayyor bo'lsa, biriktirilgandan keyin baholash avtomatik boshlanadi.
 */
export async function assignRecording(
  request: Request, env: Env, id: number, admin: any,
): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const teacherId = body.teacher_id ? parseInt(body.teacher_id, 10) : null;
  const subjectId = body.subject_id ? parseInt(body.subject_id, 10) : null;
  const groupId   = body.group_id ? parseInt(body.group_id, 10) : null;
  const topic = String(body.topic || "").trim();
  let groupName = String(body.group_name || "").trim();

  if (!teacherId) return err("O'qituvchi tanlanmagan", 400);
  if (!subjectId) return err("Fan tanlanmagan", 400);
  if (!topic)     return err("Mavzu kiritilmagan", 400);

  const rec = await env.DB.prepare(`SELECT status, lesson_id FROM recordings WHERE id = ?`)
    .bind(id).first<{ status: string; lesson_id: number | null }>();
  if (!rec) return err("Topilmadi", 404);
  if (rec.status === "skipped") return err("Bu artifact qayta ishlanmaydi (profil mos emas)", 400);

  const teacher = await env.DB.prepare(
    `SELECT id, name FROM users WHERE id = ? AND role = 'teacher' AND institution_id = ?`
  ).bind(teacherId, admin.institution_id).first<any>();
  if (!teacher) return err("O'qituvchi topilmadi", 404);

  const subject = await env.DB.prepare(
    `SELECT id, name FROM subjects WHERE id = ? AND institution_id = ?`
  ).bind(subjectId, admin.institution_id).first<any>();
  if (!subject) return err("Fan topilmadi", 404);

  if (groupId) {
    const grp = await env.DB.prepare(
      `SELECT id, name FROM groups_v2 WHERE id = ? AND institution_id = ?`
    ).bind(groupId, admin.institution_id).first<any>();
    if (!grp) return err("Guruh topilmadi", 404);
    groupName = grp.name;
  }

  await env.DB.prepare(
    `UPDATE recordings SET teacher_id = ?, subject_id = ?, group_id = ?, group_name = ?, topic = ?,
            assigned_by = ?, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).bind(teacherId, subjectId, groupId, groupName, topic, admin.id, id).run();

  // Dars allaqachon yaratilgan bo'lsa (qayta biriktirish) — uni ham yangilaymiz.
  if (rec.lesson_id) {
    await env.DB.prepare(
      `UPDATE lessons SET user_id = ?, group_name = ?, topic = ?, course_type = ? WHERE id = ?`
    ).bind(teacherId, groupName, topic, subject.name, rec.lesson_id).run();
  }

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
 * Qayta ishlash: from=download (audiotap'dan qayta yuklab olish), from=transcribe
 * (R2 dagi audio bilan STT + baholash), from=analyze (faqat baholash).
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
    await env.DB.prepare(`UPDATE recordings SET status='queued', error='', attempts=0, r2_key='' WHERE id = ?`).bind(id).run();
    await env.JOBS.send({ type: "ingest", recordingId: id });
  }
  return json({ ok: true, from });
}

export async function deleteRecording(env: Env, id: number): Promise<Response> {
  const r = await env.DB.prepare(`SELECT r2_key, lesson_id FROM recordings WHERE id = ?`).bind(id).first<any>();
  if (!r) return err("Topilmadi", 404);
  if (r.r2_key) await env.AUDIO.delete(r.r2_key).catch(() => {});
  await env.DB.prepare(`DELETE FROM recordings WHERE id = ?`).bind(id).run();  // transcripts/events CASCADE
  if (r.lesson_id) {
    // Yozuvdan yaratilgan dars ham o'chadi (baho, segmentlar, o'quvchi baholari bilan).
    await env.DB.prepare(`DELETE FROM evaluations WHERE lesson_id = ?`).bind(r.lesson_id).run();
    await env.DB.prepare(`DELETE FROM lesson_segments WHERE lesson_id = ?`).bind(r.lesson_id).run();
    await env.DB.prepare(`DELETE FROM student_lesson_evaluations WHERE lesson_id = ?`).bind(r.lesson_id).run();
    await env.DB.prepare(`DELETE FROM test_attempts WHERE lesson_id = ?`).bind(r.lesson_id).run();
    await env.DB.prepare(`DELETE FROM lesson_tests WHERE lesson_id = ?`).bind(r.lesson_id).run();
    await env.DB.prepare(`DELETE FROM lessons WHERE id = ?`).bind(r.lesson_id).run();
  }
  return json({ ok: true });
}
