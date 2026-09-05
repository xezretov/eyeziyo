/**
 * Admin: lesson evaluation questions (the questionnaire shown to students
 * after they finish a lesson's test).
 *
 * Scope rules (multi-subject via junction table `evaluation_question_subjects`):
 *   no rows in eqs        → question applies to every lesson (institution-wide / global)
 *   rows in eqs           → only lessons whose `course_type` matches one of those subjects
 *
 * We match by subject *name* rather than id because `lessons.course_type` is
 * legacy free-text from before subjects became first-class.
 */

interface Env { DB: D1Database }

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function getInstitutionId(admin: any): number | null {
  const v = admin.institution_id;
  return typeof v === "number" ? v : null;
}

async function requireInstitution(admin: any): Promise<[number, null] | [null, Response]> {
  const id = getInstitutionId(admin);
  if (!id) return [null, json({ detail: "Institution not set up", code: "NO_INSTITUTION" }, 409)];
  return [id, null];
}

// Helper: fetch subject_ids + subject_names for a question
async function getQuestionSubjects(db: D1Database, questionId: number): Promise<{ subject_ids: number[]; subject_names: string[] }> {
  const rows = await db.prepare(
    `SELECT eqs.subject_id, s.name AS subject_name
     FROM evaluation_question_subjects eqs
     JOIN subjects s ON eqs.subject_id = s.id
     WHERE eqs.question_id = ?
     ORDER BY s.name`
  ).bind(questionId).all();
  const results = rows.results || [];
  return {
    subject_ids: results.map((r: any) => r.subject_id as number),
    subject_names: results.map((r: any) => (r.subject_name || "—") as string),
  };
}

// Helper: replace junction rows for a question
async function setQuestionSubjects(db: D1Database, questionId: number, subjectIds: number[]): Promise<void> {
  await db.prepare("DELETE FROM evaluation_question_subjects WHERE question_id = ?").bind(questionId).run();
  for (const sid of subjectIds) {
    await db.prepare(
      "INSERT OR IGNORE INTO evaluation_question_subjects (question_id, subject_id) VALUES (?, ?)"
    ).bind(questionId, sid).run();
  }
}

// ── List / aggregate ─────────────────────────────────────────────────

export async function handleListEvalQuestions(admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const rows = await env.DB.prepare(
    `SELECT q.*,
       (SELECT COUNT(*) FROM student_lesson_evaluations sle WHERE sle.question_id = q.id) AS response_count,
       (SELECT ROUND(AVG(sle.rating), 2) FROM student_lesson_evaluations sle WHERE sle.question_id = q.id) AS avg_rating
     FROM evaluation_questions q
     WHERE q.institution_id = ?
     ORDER BY q.sort_order, q.id`
  ).bind(instId).all();

  const questions = rows.results || [];

  // Attach subject_ids and subject_names to each question
  const enriched = await Promise.all(questions.map(async (r: any) => {
    const subs = await getQuestionSubjects(env.DB, r.id);
    return {
      ...r,
      response_count: Number(r.response_count || 0),
      avg_rating: r.avg_rating == null ? null : Number(r.avg_rating),
      subject_ids: subs.subject_ids,
      subject_names: subs.subject_names,
    };
  }));

  return json(enriched);
}

// ── Create ───────────────────────────────────────────────────────────

export async function handleCreateEvalQuestion(request: Request, admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const b = (await request.json()) as any;
  const text = String(b.text || "").trim();
  if (!text) return json({ detail: "Savol matni kerak" }, 400);
  if (text.length > 300) return json({ detail: "Savol matni juda uzun (max 300)" }, 400);

  const scale = Math.max(2, Math.min(10, Number(b.scale) || 5));
  const sortOrder = Number.isFinite(b.sort_order) ? Number(b.sort_order) : 0;
  const active = b.active === false ? 0 : 1;

  // Accept both legacy subject_id (single) and new subject_ids (array)
  let subjectIds: number[] = [];
  if (Array.isArray(b.subject_ids)) {
    subjectIds = b.subject_ids.map(Number).filter((n: number) => Number.isFinite(n));
  } else if (b.subject_id != null) {
    subjectIds = [Number(b.subject_id)];
  }

  // Validate all subject ids belong to this institution
  for (const sid of subjectIds) {
    const own = await env.DB.prepare("SELECT id FROM subjects WHERE id = ? AND institution_id = ?")
      .bind(sid, instId).first();
    if (!own) return json({ detail: `Fan topilmadi (id=${sid})` }, 400);
  }

  const r = await env.DB.prepare(
    `INSERT INTO evaluation_questions (institution_id, subject_id, text, scale, sort_order, active)
     VALUES (?, NULL, ?, ?, ?, ?)`
  ).bind(instId, text, scale, sortOrder, active).run();

  const questionId = r.meta.last_row_id as number;
  await setQuestionSubjects(env.DB, questionId, subjectIds);

  const created = await env.DB.prepare("SELECT * FROM evaluation_questions WHERE id = ?").bind(questionId).first();
  const subs = await getQuestionSubjects(env.DB, questionId);
  return json({ ...created, ...subs }, 201);
}

// ── Update ───────────────────────────────────────────────────────────

export async function handleUpdateEvalQuestion(request: Request, admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const existing = await env.DB.prepare(
    "SELECT id FROM evaluation_questions WHERE id = ? AND institution_id = ?"
  ).bind(id, instId).first();
  if (!existing) return json({ detail: "Topilmadi" }, 404);

  const b = (await request.json()) as any;
  const fields: string[] = [];
  const values: any[] = [];

  if (typeof b.text === "string") {
    const t = b.text.trim();
    if (!t) return json({ detail: "Savol matni bo'sh bo'lmasin" }, 400);
    if (t.length > 300) return json({ detail: "Savol matni juda uzun" }, 400);
    fields.push("text = ?"); values.push(t);
  }
  if (Number.isFinite(b.scale)) {
    fields.push("scale = ?"); values.push(Math.max(2, Math.min(10, Number(b.scale))));
  }
  if (Number.isFinite(b.sort_order)) {
    fields.push("sort_order = ?"); values.push(Number(b.sort_order));
  }
  if (typeof b.active === "boolean") {
    fields.push("active = ?"); values.push(b.active ? 1 : 0);
  }

  // Handle subject_ids update (junction table)
  let subjectsUpdated = false;
  if ("subject_ids" in b) {
    const subjectIds: number[] = Array.isArray(b.subject_ids)
      ? b.subject_ids.map(Number).filter((n: number) => Number.isFinite(n))
      : [];
    for (const sid of subjectIds) {
      const own = await env.DB.prepare("SELECT id FROM subjects WHERE id = ? AND institution_id = ?")
        .bind(sid, instId).first();
      if (!own) return json({ detail: `Fan topilmadi (id=${sid})` }, 400);
    }
    await setQuestionSubjects(env.DB, id, subjectIds);
    subjectsUpdated = true;
  }

  if (fields.length === 0 && !subjectsUpdated) return json({ detail: "O'zgartirish yo'q" }, 400);

  if (fields.length > 0) {
    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);
    await env.DB.prepare(`UPDATE evaluation_questions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  }

  const updated = await env.DB.prepare("SELECT * FROM evaluation_questions WHERE id = ?").bind(id).first();
  const subs = await getQuestionSubjects(env.DB, id);
  return json({ ...updated, ...subs });
}

// ── Delete ───────────────────────────────────────────────────────────

export async function handleDeleteEvalQuestion(admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const existing = await env.DB.prepare(
    "SELECT id FROM evaluation_questions WHERE id = ? AND institution_id = ?"
  ).bind(id, instId).first();
  if (!existing) return json({ detail: "Topilmadi" }, 404);

  await env.DB.prepare("DELETE FROM student_lesson_evaluations WHERE question_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM evaluation_question_subjects WHERE question_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM evaluation_questions WHERE id = ?").bind(id).run();
  return json({ status: "ok", deleted_id: id });
}

// ── Aggregated results (per-question, per-lesson) ────────────────────

export async function handleEvalQuestionResults(admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const q = await env.DB.prepare(
    "SELECT * FROM evaluation_questions WHERE id = ? AND institution_id = ?"
  ).bind(id, instId).first();
  if (!q) return json({ detail: "Topilmadi" }, 404);

  const subs = await getQuestionSubjects(env.DB, id);

  // Distribution per rating
  const dist = await env.DB.prepare(
    "SELECT rating, COUNT(*) as c FROM student_lesson_evaluations WHERE question_id = ? GROUP BY rating ORDER BY rating"
  ).bind(id).all();

  return json({
    question: { ...q, ...subs },
    distribution: dist.results,
  });
}
