// ═══════════════════════════════════════════════════════
// Teacher: student management + mentor (student-facing) endpoints
// ═══════════════════════════════════════════════════════

import { generateLessonTest, chatWithLesson } from "./gemini";
import { hashPassword } from "./auth";

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  JWT_SECRET: string;
  DB: D1Database;
  RECORDING_SESSION: DurableObjectNamespace;
}

function json(data: any, status = 200): Response {
  // CORS headers are added by the top-level worker (see index.ts withCors).
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function parseGroups(raw: string | null | undefined): Array<string> {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((g: any) => typeof g === "string" ? g : (g?.name || "")).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Students: list / create / update / delete ──

export async function handleListStudents(user: any, env: Env): Promise<Response> {
  if (user.role !== "teacher" && user.role !== "admin") {
    return json({ detail: "Ruxsat yo'q" }, 403);
  }

  const instId = user.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  const rows = await env.DB.prepare(
    `SELECT id, email, name, avatar, groups, created_at FROM users
     WHERE role = 'student' AND institution_id = ? AND (type IS NULL OR type = ?)
     ORDER BY created_at DESC`
  ).bind(instId, instType).all();

  const students = (rows.results || []).map((r: any) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    avatar: r.avatar,
    groups: parseGroups(r.groups),
    created_at: r.created_at,
  }));

  if (user.role === "admin") return json(students);

  const teacherGroups = parseGroups(user.groups);
  return json(students.filter(s => s.groups.some(g => teacherGroups.includes(g))));
}

export async function handleCreateStudent(request: Request, user: any, env: Env): Promise<Response> {
  if (user.role !== "teacher" && user.role !== "admin") {
    return json({ detail: "Ruxsat yo'q" }, 403);
  }

  const body = (await request.json()) as any;
  const name = String(body.name || "").trim();
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");
  const groups: string[] = Array.isArray(body.groups)
    ? body.groups.map((g: any) => String(g).trim()).filter(Boolean)
    : [];

  if (!name || !email || password.length < 8) {
    return json({ detail: "Ism, email va parol (kamida 8 belgi) kerak" }, 400);
  }
  if (groups.length === 0) {
    return json({ detail: "Kamida bitta guruh belgilang" }, 400);
  }

  if (user.role === "teacher") {
    const teacherGroups = parseGroups(user.groups);
    const invalid = groups.filter(g => !teacherGroups.includes(g));
    if (invalid.length > 0) {
      return json({ detail: `Siz ega bo'lmagan guruhlar: ${invalid.join(", ")}` }, 403);
    }
  }

  const hash = await hashPassword(password);

  const instId = user.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  try {
    await env.DB.prepare(
      `INSERT INTO users (email, password_hash, name, role, avatar, groups, institution_id, type)
       VALUES (?, ?, ?, 'student', ?, ?, ?, ?)`
    ).bind(
      email, hash, name,
      name.charAt(0).toUpperCase(),
      JSON.stringify(groups),
      instId, instType
    ).run();

    const created = await env.DB.prepare(
      "SELECT id, email, name, avatar, groups, created_at FROM users WHERE email = ?"
    ).bind(email).first();

    return json({
      id: created!.id,
      email: created!.email,
      name: created!.name,
      avatar: created!.avatar,
      groups: parseGroups(created!.groups as string),
      created_at: created!.created_at,
    }, 201);
  } catch {
    return json({ detail: "Bu email band yoki xatolik" }, 409);
  }
}

export async function handleUpdateStudent(request: Request, user: any, env: Env, studentId: number): Promise<Response> {
  if (user.role !== "teacher" && user.role !== "admin") {
    return json({ detail: "Ruxsat yo'q" }, 403);
  }

  const instId = user.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  const student = await env.DB.prepare(
    `SELECT * FROM users WHERE id = ? AND role = 'student'
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(studentId, instId, instType).first();
  if (!student) return json({ detail: "O'quvchi topilmadi" }, 404);

  if (user.role === "teacher") {
    const teacherGroups = parseGroups(user.groups);
    const studentGroups = parseGroups(student.groups as string);
    if (!studentGroups.some(g => teacherGroups.includes(g))) {
      return json({ detail: "Bu o'quvchi sizning guruhingizda emas" }, 403);
    }
  }

  const body = (await request.json()) as any;
  const fields: string[] = [];
  const values: any[] = [];

  if (typeof body.name === "string" && body.name.trim()) {
    fields.push("name = ?");
    values.push(body.name.trim());
    fields.push("avatar = ?");
    values.push(body.name.trim().charAt(0).toUpperCase());
  }
  if (typeof body.email === "string" && body.email.trim()) {
    const email = body.email.toLowerCase().trim();
    if (email !== student.email) {
      const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id != ?")
        .bind(email, studentId).first();
      if (exists) return json({ detail: "Email boshqa foydalanuvchida band" }, 409);
    }
    fields.push("email = ?");
    values.push(email);
  }
  if (Array.isArray(body.groups)) {
    const groups: string[] = body.groups.map((g: any) => String(g).trim()).filter(Boolean);
    if (user.role === "teacher") {
      const teacherGroups = parseGroups(user.groups);
      const invalid = groups.filter(g => !teacherGroups.includes(g));
      if (invalid.length > 0) return json({ detail: `Ruxsatsiz guruh: ${invalid.join(", ")}` }, 403);
    }
    fields.push("groups = ?");
    values.push(JSON.stringify(groups));
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return json({ detail: "Parol kamida 8 belgi bo'lishi kerak" }, 400);
    }
    const hash = await hashPassword(body.password);
    fields.push("password_hash = ?");
    values.push(hash);
  }

  if (fields.length === 0) return json({ detail: "O'zgartirish yo'q" }, 400);
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(studentId);

  await env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const updated = await env.DB.prepare(
    "SELECT id, email, name, avatar, groups, created_at FROM users WHERE id = ?"
  ).bind(studentId).first();

  return json({
    id: updated!.id,
    email: updated!.email,
    name: updated!.name,
    avatar: updated!.avatar,
    groups: parseGroups(updated!.groups as string),
    created_at: updated!.created_at,
  });
}

export async function handleDeleteStudent(user: any, env: Env, studentId: number): Promise<Response> {
  if (user.role !== "teacher" && user.role !== "admin") {
    return json({ detail: "Ruxsat yo'q" }, 403);
  }

  const instId = user.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  const student = await env.DB.prepare(
    `SELECT groups, role FROM users WHERE id = ?
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(studentId, instId, instType).first();
  if (!student) return json({ detail: "O'quvchi topilmadi" }, 404);
  if (student.role !== "student") return json({ detail: "Faqat o'quvchilarni o'chirish" }, 400);

  if (user.role === "teacher") {
    const teacherGroups = parseGroups(user.groups);
    const studentGroups = parseGroups(student.groups as string);
    if (!studentGroups.some(g => teacherGroups.includes(g))) {
      return json({ detail: "Bu o'quvchi sizning guruhingizda emas" }, 403);
    }
  }

  await env.DB.prepare("DELETE FROM mentor_chats WHERE student_id = ?").bind(studentId).run();
  await env.DB.prepare("DELETE FROM test_attempts WHERE student_id = ?").bind(studentId).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(studentId).run();
  return json({ status: "ok", deleted_student_id: studentId });
}

// ── Mentor (student-facing) ──

function requireStudent(user: any): Response | null {
  if (user.role !== "student") return json({ detail: "O'quvchi huquqi kerak" }, 403);
  return null;
}

async function fetchLessonForStudent(env: Env, student: any, lessonId: number): Promise<any | Response> {
  const lesson = await env.DB.prepare(
    "SELECT l.*, u.name AS teacher_name FROM lessons l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = ?"
  ).bind(lessonId).first();
  if (!lesson) return json({ detail: "Dars topilmadi" }, 404);

  const groups = parseGroups(student.groups);
  if (!groups.includes(lesson.group_name as string)) {
    return json({ detail: "Bu dars sizning guruhingizdan emas" }, 403);
  }
  return lesson;
}

export async function handleMentorLessons(student: any, env: Env): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;

  const groups = parseGroups(student.groups);
  if (groups.length === 0) return json([]);

  const placeholders = groups.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT l.id, l.group_name, l.topic, l.course_type, l.duration_seconds, l.created_at, l.user_id,
            u.name AS teacher_name,
            ta.score AS attempt_score,
            ta.completed_at AS attempt_completed_at
     FROM lessons l
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN test_attempts ta ON ta.lesson_id = l.id AND ta.student_id = ?
     WHERE l.group_name IN (${placeholders})
     ORDER BY l.created_at DESC
     LIMIT 100`
  ).bind(student.id, ...groups).all();

  const out = (rows.results || []).map((r: any) => ({
    id: r.id,
    group_name: r.group_name,
    topic: r.topic,
    course_type: r.course_type,
    duration_seconds: r.duration_seconds,
    created_at: r.created_at,
    teacher_name: r.teacher_name || "",
    attempt_score: r.attempt_score,
    attempt_completed_at: r.attempt_completed_at,
  }));

  return json(out);
}

export async function handleMentorLesson(student: any, env: Env, lessonId: number): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;
  const lesson = await fetchLessonForStudent(env, student, lessonId);
  if (lesson instanceof Response) return lesson;

  const attempt = await env.DB.prepare(
    "SELECT score, completed_at FROM test_attempts WHERE lesson_id = ? AND student_id = ?"
  ).bind(lessonId, student.id).first();

  return json({
    id: lesson.id,
    group_name: lesson.group_name,
    topic: lesson.topic,
    course_type: lesson.course_type,
    duration_seconds: lesson.duration_seconds,
    created_at: lesson.created_at,
    teacher_name: lesson.teacher_name || "",
    attempt: attempt ? { score: attempt.score, completed_at: attempt.completed_at } : null,
  });
}

async function getOrGenerateTest(env: Env, lesson: any): Promise<{ questions: any[]; key_terms: any[] }> {
  const existing = await env.DB.prepare(
    "SELECT questions, key_terms FROM lesson_tests WHERE lesson_id = ?"
  ).bind(lesson.id).first();

  if (existing) {
    return {
      questions: JSON.parse(existing.questions as string),
      key_terms: JSON.parse(existing.key_terms as string),
    };
  }

  const pack = await generateLessonTest(
    env.GEMINI_API_KEY,
    (lesson.transcript as string) || "",
    (lesson.course_type as string) || "",
    (lesson.topic as string) || ""
  );

  if (pack.questions.length === 0 && pack.key_terms.length === 0) return pack;

  await env.DB.prepare(
    "INSERT OR REPLACE INTO lesson_tests (lesson_id, questions, key_terms) VALUES (?, ?, ?)"
  ).bind(lesson.id, JSON.stringify(pack.questions), JSON.stringify(pack.key_terms)).run();

  return pack;
}

export async function handleMentorTest(student: any, env: Env, lessonId: number): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;
  const lesson = await fetchLessonForStudent(env, student, lessonId);
  if (lesson instanceof Response) return lesson;

  const pack = await getOrGenerateTest(env, lesson);

  const attempt = await env.DB.prepare(
    "SELECT answers, score, completed_at FROM test_attempts WHERE lesson_id = ? AND student_id = ?"
  ).bind(lessonId, student.id).first();

  return json({
    lesson_id: lesson.id,
    topic: lesson.topic,
    questions: pack.questions.map((q: any) => ({
      q: q.q,
      choices: q.choices,
    })),
    key_terms: pack.key_terms,
    attempt: attempt ? {
      answers: JSON.parse(attempt.answers as string),
      score: attempt.score,
      completed_at: attempt.completed_at,
    } : null,
  });
}

export async function handleMentorSubmitTest(request: Request, student: any, env: Env, lessonId: number): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;
  const lesson = await fetchLessonForStudent(env, student, lessonId);
  if (lesson instanceof Response) return lesson;

  const body = (await request.json()) as any;
  const answers = Array.isArray(body.answers) ? body.answers : [];

  const pack = await getOrGenerateTest(env, lesson);
  const qs = pack.questions;
  if (qs.length === 0) return json({ detail: "Test tayyor emas" }, 400);

  let correctCount = 0;
  const detailed = qs.map((q: any, i: number) => {
    const selected = Number.isInteger(answers[i]) ? answers[i] : -1;
    const ok = selected === q.correct;
    if (ok) correctCount++;
    return {
      q: q.q,
      choices: q.choices,
      selected,
      correct_choice: q.correct,
      is_correct: ok,
      explanation: q.explanation,
    };
  });
  const score = Math.round((correctCount / qs.length) * 100);

  await env.DB.prepare(
    "INSERT OR REPLACE INTO test_attempts (lesson_id, student_id, answers, score) VALUES (?, ?, ?, ?)"
  ).bind(lessonId, student.id, JSON.stringify(answers), score).run();

  return json({
    lesson_id: lessonId,
    score,
    total: qs.length,
    correct: correctCount,
    results: detailed,
    key_terms: pack.key_terms,
  });
}

export async function handleMentorChatHistory(student: any, env: Env, lessonId: number): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;
  const lesson = await fetchLessonForStudent(env, student, lessonId);
  if (lesson instanceof Response) return lesson;

  const rows = await env.DB.prepare(
    "SELECT role, content, created_at FROM mentor_chats WHERE lesson_id = ? AND student_id = ? ORDER BY id ASC LIMIT 100"
  ).bind(lessonId, student.id).all();

  return json({
    lesson_id: lessonId,
    messages: (rows.results || []).map((r: any) => ({
      role: r.role,
      content: r.content,
      created_at: r.created_at,
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Lesson evaluation — student rates the teacher with admin-defined questions.
// Matching rules:
//   - subject_id IS NULL  → applies to every lesson
//   - subject_id matches  → only for lessons whose course_type matches that
//     subject's name (case-insensitive). We resolve via JOIN at query time.
// ─────────────────────────────────────────────────────────────────────

export async function handleMentorEvaluationGet(student: any, env: Env, lessonId: number): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;
  const lesson = await fetchLessonForStudent(env, student, lessonId);
  if (lesson instanceof Response) return lesson;

  const courseType = (lesson.course_type as string) || "";
  const instId = student.institution_id;

  const questions = await env.DB.prepare(
    `SELECT q.*
     FROM evaluation_questions q
     WHERE q.institution_id = ? AND q.active = 1
       AND (
         NOT EXISTS (SELECT 1 FROM evaluation_question_subjects eqs WHERE eqs.question_id = q.id)
         OR EXISTS (
           SELECT 1 FROM evaluation_question_subjects eqs
           JOIN subjects s ON eqs.subject_id = s.id
           WHERE eqs.question_id = q.id AND LOWER(s.name) = LOWER(?)
         )
       )
     ORDER BY q.sort_order, q.id`
  ).bind(instId, courseType).all();

  const existing = await env.DB.prepare(
    "SELECT question_id, rating FROM student_lesson_evaluations WHERE lesson_id = ? AND student_id = ?"
  ).bind(lessonId, student.id).all();

  const previous: Record<number, number> = {};
  (existing.results || []).forEach((r: any) => {
    previous[r.question_id] = r.rating;
  });

  return json({
    lesson_id: lessonId,
    topic: lesson.topic,
    teacher_name: lesson.teacher_name || "",
    submitted: Object.keys(previous).length > 0,
    questions: (questions.results || []).map((q: any) => ({
      id: q.id,
      text: q.text,
      scale: q.scale,
      subject_id: q.subject_id,
      subject_name: q.subject_name,
      previous_rating: previous[q.id] ?? null,
    })),
  });
}

export async function handleMentorEvaluationSubmit(request: Request, student: any, env: Env, lessonId: number): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;
  const lesson = await fetchLessonForStudent(env, student, lessonId);
  if (lesson instanceof Response) return lesson;

  const body = (await request.json()) as any;
  const ratings: Array<{ question_id: number; rating: number }> = Array.isArray(body.ratings) ? body.ratings : [];
  if (ratings.length === 0) return json({ detail: "Hech bo'lmasa bitta savolga javob bering" }, 400);

  // Re-fetch the active questions for this lesson so we can validate every
  // submitted question_id and rating range.
  const courseType = (lesson.course_type as string) || "";
  const instId = student.institution_id;
  const valid = await env.DB.prepare(
    `SELECT q.id, q.scale FROM evaluation_questions q
     WHERE q.institution_id = ? AND q.active = 1
       AND (
         NOT EXISTS (SELECT 1 FROM evaluation_question_subjects eqs WHERE eqs.question_id = q.id)
         OR EXISTS (
           SELECT 1 FROM evaluation_question_subjects eqs
           JOIN subjects s ON eqs.subject_id = s.id
           WHERE eqs.question_id = q.id AND LOWER(s.name) = LOWER(?)
         )
       )`
  ).bind(instId, courseType).all();

  const validMap = new Map<number, number>();
  (valid.results || []).forEach((r: any) => validMap.set(r.id, r.scale));

  for (const r of ratings) {
    const qid = Number(r.question_id);
    const rating = Number(r.rating);
    const scale = validMap.get(qid);
    if (!scale) return json({ detail: `Savol topilmadi: ${qid}` }, 400);
    if (!Number.isInteger(rating) || rating < 1 || rating > scale) {
      return json({ detail: `Yaroqsiz baho: ${rating} (1..${scale})` }, 400);
    }
  }

  // INSERT OR REPLACE so re-submission updates the prior rating.
  for (const r of ratings) {
    await env.DB.prepare(
      `INSERT INTO student_lesson_evaluations (lesson_id, student_id, question_id, rating, submitted_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(lesson_id, student_id, question_id)
       DO UPDATE SET rating = excluded.rating, submitted_at = excluded.submitted_at`
    ).bind(lessonId, student.id, Number(r.question_id), Number(r.rating)).run();
  }

  return json({ status: "ok", count: ratings.length });
}

/**
 * Lessons the student has finished a test for but hasn't yet rated. Drives
 * the in-app "rate this lesson" reminder and the home banner.
 */
export async function handleMentorEvaluationPending(student: any, env: Env): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;

  const groups = parseGroups(student.groups);
  if (groups.length === 0) return json([]);

  const placeholders = groups.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT l.id, l.topic, l.group_name, l.course_type, l.created_at,
            u.name AS teacher_name,
            ta.completed_at AS test_completed_at
     FROM lessons l
     JOIN test_attempts ta ON ta.lesson_id = l.id AND ta.student_id = ?
     LEFT JOIN users u ON u.id = l.user_id
     WHERE l.group_name IN (${placeholders})
       AND NOT EXISTS (
         SELECT 1 FROM student_lesson_evaluations sle
         WHERE sle.lesson_id = l.id AND sle.student_id = ?
       )
       AND EXISTS (
         SELECT 1 FROM evaluation_questions q
         WHERE q.institution_id = ? AND q.active = 1
           AND (
             NOT EXISTS (SELECT 1 FROM evaluation_question_subjects eqs WHERE eqs.question_id = q.id)
             OR EXISTS (
               SELECT 1 FROM evaluation_question_subjects eqs
               JOIN subjects s ON eqs.subject_id = s.id
               WHERE eqs.question_id = q.id AND LOWER(s.name) = LOWER(l.course_type)
             )
           )
       )
     ORDER BY ta.completed_at DESC
     LIMIT 20`
  ).bind(student.id, ...groups, student.id, student.institution_id).all();

  return json((rows.results || []).map((r: any) => ({
    lesson_id: r.id,
    topic: r.topic,
    group_name: r.group_name,
    course_type: r.course_type,
    teacher_name: r.teacher_name || "",
    created_at: r.created_at,
    test_completed_at: r.test_completed_at,
  })));
}

export async function handleMentorChatSend(request: Request, student: any, env: Env, lessonId: number): Promise<Response> {
  const notOk = requireStudent(student);
  if (notOk) return notOk;
  const lesson = await fetchLessonForStudent(env, student, lessonId);
  if (lesson instanceof Response) return lesson;

  const body = (await request.json()) as any;
  const userMessage = String(body.message || "").trim();
  if (!userMessage) return json({ detail: "Xabar bo'sh" }, 400);
  if (userMessage.length > 2000) return json({ detail: "Xabar juda uzun (max 2000)" }, 400);

  const historyRows = await env.DB.prepare(
    "SELECT role, content FROM mentor_chats WHERE lesson_id = ? AND student_id = ? ORDER BY id ASC LIMIT 30"
  ).bind(lessonId, student.id).all();

  const history = (historyRows.results || []).map((r: any) => ({
    role: r.role as "user" | "assistant",
    content: r.content as string,
  }));

  const reply = await chatWithLesson(
    env.GEMINI_API_KEY,
    (lesson.transcript as string) || "",
    (lesson.course_type as string) || "",
    (lesson.topic as string) || "",
    history,
    userMessage
  );

  if (!reply) return json({ detail: "AI javob bera olmadi, keyinroq urinib ko'ring" }, 502);

  await env.DB.prepare(
    "INSERT INTO mentor_chats (lesson_id, student_id, role, content) VALUES (?, ?, 'user', ?)"
  ).bind(lessonId, student.id, userMessage).run();

  await env.DB.prepare(
    "INSERT INTO mentor_chats (lesson_id, student_id, role, content) VALUES (?, ?, 'assistant', ?)"
  ).bind(lessonId, student.id, reply).run();

  return json({
    user_message: userMessage,
    assistant_reply: reply,
  });
}
