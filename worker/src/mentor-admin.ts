// ═══════════════════════════════════════════════════════
// Admin-facing student views (aggregated stats)
// ═══════════════════════════════════════════════════════

import { parseGroups } from "./mentor";

interface Env {
  DB: D1Database;
  [key: string]: any;
}

function json(data: any, status = 200): Response {
  // CORS headers are added by the top-level worker (see index.ts withCors).
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleAdminStudents(admin: any, env: Env): Promise<Response> {
  const instId = admin?.institution_id;
  if (!instId) return json([]);
  const instRow = await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first();
  const instType = (instRow?.type as string) || null;

  const rows = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.avatar, u.groups, u.created_at,
            COUNT(DISTINCT ta.lesson_id) AS attempts_count,
            AVG(ta.score) AS avg_score,
            MAX(ta.completed_at) AS last_attempt_at
     FROM users u
     LEFT JOIN test_attempts ta ON ta.student_id = u.id
     WHERE u.role = 'student'
       AND u.institution_id = ?
       AND (u.type IS NULL OR u.type = ?)
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  ).bind(instId, instType).all();

  const out = (rows.results || []).map((r: any) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    avatar: r.avatar,
    groups: parseGroups(r.groups),
    created_at: r.created_at,
    attempts_count: r.attempts_count || 0,
    avg_score: r.avg_score ? Math.round(r.avg_score) : 0,
    last_attempt_at: r.last_attempt_at,
  }));

  return json(out);
}

export async function handleAdminStudentDetail(admin: any, env: Env, studentId: number): Promise<Response> {
  const instId = admin?.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  const student = await env.DB.prepare(
    `SELECT id, email, name, avatar, groups, created_at FROM users
     WHERE id = ? AND role = 'student' AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(studentId, instId, instType).first();
  if (!student) return json({ detail: "O'quvchi topilmadi" }, 404);

  const groups = parseGroups(student.groups as string);

  // Attempts (with lesson info)
  const attempts = await env.DB.prepare(
    `SELECT ta.lesson_id, ta.score, ta.completed_at, l.topic, l.group_name, l.course_type, u.name AS teacher_name
     FROM test_attempts ta
     LEFT JOIN lessons l ON l.id = ta.lesson_id
     LEFT JOIN users u ON u.id = l.user_id
     WHERE ta.student_id = ?
     ORDER BY ta.completed_at DESC
     LIMIT 100`
  ).bind(studentId).all();

  // Available lessons in their groups (those NOT yet attempted)
  let availableCount = 0;
  if (groups.length > 0) {
    const placeholders = groups.map(() => "?").join(",");
    const avail = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM lessons l
       WHERE l.group_name IN (${placeholders})
         AND NOT EXISTS (SELECT 1 FROM test_attempts ta WHERE ta.lesson_id = l.id AND ta.student_id = ?)`
    ).bind(...groups, studentId).first();
    availableCount = Number((avail as any)?.c || 0);
  }

  const rows = (attempts.results || []).map((r: any) => ({
    lesson_id: r.lesson_id,
    topic: r.topic,
    group_name: r.group_name,
    course_type: r.course_type,
    teacher_name: r.teacher_name,
    score: r.score,
    completed_at: r.completed_at,
  }));

  const avg = rows.length > 0
    ? Math.round(rows.reduce((s: number, r: any) => s + (r.score || 0), 0) / rows.length)
    : 0;

  // Per-group stats: for each group the student belongs to,
  // compute attempts count, avg score, and total lessons available.
  const groupStats: Array<{
    group_name: string;
    attempts: number;
    avg_score: number;
    total_lessons: number;
    pending: number;
    last_attempt_at: string | null;
  }> = [];
  for (const gName of groups) {
    const gAttempts = rows.filter((r: any) => r.group_name === gName);
    const gAvg = gAttempts.length > 0
      ? Math.round(gAttempts.reduce((s: number, r: any) => s + (r.score || 0), 0) / gAttempts.length)
      : 0;
    const lessonRow = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM lessons WHERE group_name = ?"
    ).bind(gName).first();
    const total = Number((lessonRow as any)?.c || 0);
    const last = gAttempts.length > 0 ? gAttempts[0].completed_at : null;
    groupStats.push({
      group_name: gName,
      attempts: gAttempts.length,
      avg_score: gAvg,
      total_lessons: total,
      pending: Math.max(0, total - gAttempts.length),
      last_attempt_at: last,
    });
  }

  // Recent trend (last 7 attempts, oldest→newest)
  const recent = [...rows].slice(0, 10).reverse().map((r: any) => ({
    score: r.score,
    topic: r.topic,
    date: r.completed_at,
  }));

  return json({
    id: student.id,
    email: student.email,
    name: student.name,
    avatar: student.avatar,
    groups,
    created_at: student.created_at,
    total_attempts: rows.length,
    average_score: avg,
    pending_lessons: availableCount,
    attempts: rows,
    group_stats: groupStats,
    recent_trend: recent,
  });
}
