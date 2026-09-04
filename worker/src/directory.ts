/** O'qituvchi / fan / manba CRUD — qo'lda biriktirish uchun ma'lumotnoma. */
import { Env, json, err } from "./types";

// ── O'qituvchilar ──

export async function listTeachers(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT t.*, COUNT(r.id) AS lesson_count, COUNT(a.id) AS evaluated_count,
            ROUND(AVG(a.overall_score)) AS avg_score,
            ROUND(COALESCE(SUM(r.duration_seconds),0)/60.0) AS total_minutes,
            MAX(r.created_at) AS last_lesson_at
       FROM teachers t
       LEFT JOIN recordings r ON r.teacher_id = t.id AND r.status != 'skipped'
       LEFT JOIN analyses  a ON a.recording_id = r.id
      GROUP BY t.id ORDER BY t.full_name`
  ).all();
  return json({ items: rows.results });
}

export async function getTeacher(env: Env, id: number): Promise<Response> {
  const t = await env.DB.prepare(`SELECT * FROM teachers WHERE id = ?`).bind(id).first<any>();
  if (!t) return err("Topilmadi", 404);

  const st = await env.DB.prepare(
    `SELECT COUNT(r.id) AS lessons, COUNT(a.id) AS evaluated,
            ROUND(AVG(a.overall_score)) AS avg_score,
            ROUND(COALESCE(SUM(r.duration_seconds),0)/60.0) AS total_minutes,
            ROUND(AVG(a.topic_score),1)       AS avg_topic,
            ROUND(AVG(a.speech_score),1)      AS avg_speech,
            ROUND(AVG(a.method_score),1)      AS avg_method,
            ROUND(AVG(a.interaction_score),1) AS avg_interaction,
            ROUND(AVG(a.feedback_score),1)    AS avg_feedback,
            MAX(r.created_at) AS last_lesson_at
       FROM recordings r LEFT JOIN analyses a ON a.recording_id = r.id
      WHERE r.teacher_id = ? AND r.status != 'skipped'`
  ).bind(id).first<any>();

  const recs = await env.DB.prepare(
    `SELECT r.id, r.topic, r.group_name, r.status, r.duration_seconds, r.started_at, r.created_at,
            r.source_name, s.display_name AS source_display, sub.name AS subject_name,
            a.overall_score
       FROM recordings r
       LEFT JOIN subjects sub ON sub.id = r.subject_id
       LEFT JOIN sources s    ON s.id = r.source_id
       LEFT JOIN analyses a   ON a.recording_id = r.id
      WHERE r.teacher_id = ? AND r.status != 'skipped'
      ORDER BY r.created_at DESC LIMIT 50`
  ).bind(id).all();

  return json({ teacher: t, stats: st, recordings: recs.results });
}

export async function createTeacher(request: Request, env: Env): Promise<Response> {
  const b: any = await request.json().catch(() => ({}));
  const name = String(b.full_name || "").trim();
  if (!name) return err("F.I.Sh kiritilmagan", 400);
  const r = await env.DB.prepare(
    `INSERT INTO teachers (full_name, department, position, phone, email)
     VALUES (?,?,?,?,?)`
  ).bind(name, String(b.department || ""), String(b.position || ""),
         String(b.phone || ""), String(b.email || "")).run();
  return json({ ok: true, id: Number(r.meta.last_row_id) }, 201);
}

export async function updateTeacher(request: Request, env: Env, id: number): Promise<Response> {
  const b: any = await request.json().catch(() => ({}));
  if (b.full_name !== undefined && !String(b.full_name).trim()) return err("F.I.Sh bo'sh bo'lmasin", 400);
  await env.DB.prepare(
    `UPDATE teachers SET
       full_name  = COALESCE(?, full_name),
       department = COALESCE(?, department),
       position   = COALESCE(?, position),
       phone      = COALESCE(?, phone),
       email      = COALESCE(?, email),
       active     = COALESCE(?, active)
     WHERE id = ?`
  ).bind(b.full_name ?? null, b.department ?? null, b.position ?? null,
         b.phone ?? null, b.email ?? null,
         b.active === undefined ? null : (b.active ? 1 : 0), id).run();
  return json({ ok: true });
}

/** O'chirish — yozuvlar qoladi, teacher_id NULL bo'ladi (ON DELETE SET NULL). */
export async function deleteTeacher(env: Env, id: number): Promise<Response> {
  const r = await env.DB.prepare(`DELETE FROM teachers WHERE id = ?`).bind(id).run();
  if (!r.meta.changes) return err("Topilmadi", 404);
  return json({ ok: true });
}

// ── Fanlar ──

export async function listSubjects(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT s.*, COUNT(r.id) AS lesson_count, ROUND(AVG(a.overall_score)) AS avg_score
       FROM subjects s
       LEFT JOIN recordings r ON r.subject_id = s.id AND r.status != 'skipped'
       LEFT JOIN analyses  a ON a.recording_id = r.id
      GROUP BY s.id ORDER BY s.name`
  ).all();
  return json({ items: rows.results });
}

export async function createSubject(request: Request, env: Env): Promise<Response> {
  const b: any = await request.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  if (!name) return err("Fan nomi kiritilmagan", 400);
  await env.DB.prepare(
    `INSERT INTO subjects (name, code) VALUES (?,?)
     ON CONFLICT(name) DO UPDATE SET code = excluded.code, active = 1`
  ).bind(name, String(b.code || "")).run();
  const row = await env.DB.prepare(`SELECT id FROM subjects WHERE name = ?`).bind(name).first<{ id: number }>();
  return json({ ok: true, id: row?.id }, 201);
}

export async function updateSubject(request: Request, env: Env, id: number): Promise<Response> {
  const b: any = await request.json().catch(() => ({}));
  const name = b.name === undefined ? null : String(b.name).trim();
  if (name === "") return err("Fan nomi bo'sh bo'lmasin", 400);
  try {
    await env.DB.prepare(
      `UPDATE subjects SET
         name   = COALESCE(?, name),
         code   = COALESCE(?, code),
         active = COALESCE(?, active)
       WHERE id = ?`
    ).bind(name, b.code ?? null,
           b.active === undefined ? null : (b.active ? 1 : 0), id).run();
  } catch (e: any) {
    if (String(e?.message || "").includes("UNIQUE")) return err("Bunday nomli fan allaqachon bor", 409);
    throw e;
  }
  return json({ ok: true });
}

export async function deleteSubject(env: Env, id: number): Promise<Response> {
  const r = await env.DB.prepare(`DELETE FROM subjects WHERE id = ?`).bind(id).run();
  if (!r.meta.changes) return err("Topilmadi", 404);
  return json({ ok: true });
}

// ── Audio manbalar (xonalar) ──

export async function listSources(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT s.*, COUNT(r.id) AS recording_count,
            MAX(r.created_at) AS last_seen
       FROM sources s LEFT JOIN recordings r ON r.source_id = s.id
      GROUP BY s.id ORDER BY s.display_name`
  ).all();
  return json({ items: rows.results });
}

export async function updateSource(request: Request, env: Env, id: number): Promise<Response> {
  const b: any = await request.json().catch(() => ({}));
  await env.DB.prepare(
    `UPDATE sources SET
       display_name = COALESCE(?, display_name),
       building     = COALESCE(?, building),
       room         = COALESCE(?, room),
       active       = COALESCE(?, active)
     WHERE id = ?`
  ).bind(b.display_name ?? null, b.building ?? null, b.room ?? null,
         b.active === undefined ? null : (b.active ? 1 : 0), id).run();
  return json({ ok: true });
}
