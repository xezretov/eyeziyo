/** Dashboard: umumiy statistika + jonli konveyer holati. */
import { Env, json } from "./types";

const IN_PROGRESS = `'queued','downloading','stored','transcribing','analyzing'`;

export async function stats(request: Request, env: Env): Promise<Response> {
  const days = Math.min(365, Math.max(1, parseInt(
    new URL(request.url).searchParams.get("days") || "30", 10) || 30));
  const since = `-${days} days`;

  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='done' THEN 1 ELSE 0 END)  AS done,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status='awaiting_assignment' THEN 1 ELSE 0 END) AS awaiting,
            SUM(CASE WHEN status IN (${IN_PROGRESS}) THEN 1 ELSE 0 END) AS in_progress,
            COALESCE(SUM(duration_seconds),0)/60.0 AS total_minutes
       FROM recordings
      WHERE status != 'skipped' AND created_at >= datetime('now', ?)`
  ).bind(since).first<any>();

  const score = await env.DB.prepare(
    `SELECT ROUND(AVG(a.overall_score)) AS avg_overall,
            ROUND(AVG(a.topic_score),1)       AS avg_topic,
            ROUND(AVG(a.speech_score),1)      AS avg_speech,
            ROUND(AVG(a.method_score),1)      AS avg_method,
            ROUND(AVG(a.interaction_score),1) AS avg_interaction,
            ROUND(AVG(a.feedback_score),1)    AS avg_feedback,
            COUNT(*) AS evaluated
       FROM analyses a JOIN recordings r ON r.id = a.recording_id
      WHERE r.created_at >= datetime('now', ?)`
  ).bind(since).first<any>();

  const daily = await env.DB.prepare(
    `SELECT DATE(r.created_at) AS day, COUNT(*) AS count,
            ROUND(AVG(a.overall_score)) AS avg_score
       FROM recordings r LEFT JOIN analyses a ON a.recording_id = r.id
      WHERE r.status != 'skipped' AND r.created_at >= datetime('now', ?)
      GROUP BY day ORDER BY day`
  ).bind(since).all();

  const topTeachers = await env.DB.prepare(
    `SELECT t.id, t.full_name, t.department, COUNT(a.id) AS lessons,
            ROUND(AVG(a.overall_score)) AS avg_score
       FROM analyses a
       JOIN recordings r ON r.id = a.recording_id
       JOIN teachers t   ON t.id = r.teacher_id
      WHERE r.created_at >= datetime('now', ?)
      GROUP BY t.id HAVING lessons > 0
      ORDER BY avg_score DESC LIMIT 10`
  ).bind(since).all();

  const bySource = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(s.display_name,''), r.source_name, '—') AS source,
            s.id AS source_id,
            COUNT(*) AS count, ROUND(AVG(a.overall_score)) AS avg_score
       FROM recordings r
       LEFT JOIN sources s  ON s.id = r.source_id
       LEFT JOIN analyses a ON a.recording_id = r.id
      WHERE r.status != 'skipped' AND r.created_at >= datetime('now', ?)
      GROUP BY source ORDER BY count DESC LIMIT 20`
  ).bind(since).all();

  // Haftalik dinamika: oxirgi 7 kun vs undan oldingi 7 kun.
  const wk = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN r.created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS cur_lessons,
       SUM(CASE WHEN r.created_at <  datetime('now','-7 days') THEN 1 ELSE 0 END) AS prev_lessons,
       COALESCE(SUM(CASE WHEN r.created_at >= datetime('now','-7 days') THEN r.duration_seconds ELSE 0 END),0)/60.0 AS cur_minutes,
       COALESCE(SUM(CASE WHEN r.created_at <  datetime('now','-7 days') THEN r.duration_seconds ELSE 0 END),0)/60.0 AS prev_minutes,
       AVG(CASE WHEN r.created_at >= datetime('now','-7 days') THEN a.overall_score END) AS cur_score,
       AVG(CASE WHEN r.created_at <  datetime('now','-7 days') THEN a.overall_score END) AS prev_score
     FROM recordings r LEFT JOIN analyses a ON a.recording_id = r.id
     WHERE r.status != 'skipped' AND r.created_at >= datetime('now','-14 days')`
  ).first<any>();

  // Sifat taqsimoti (baholangan darslar bo'yicha).
  const dist = await env.DB.prepare(
    `SELECT SUM(CASE WHEN a.overall_score >= 85 THEN 1 ELSE 0 END) AS excellent,
            SUM(CASE WHEN a.overall_score >= 70 AND a.overall_score < 85 THEN 1 ELSE 0 END) AS good,
            SUM(CASE WHEN a.overall_score >= 50 AND a.overall_score < 70 THEN 1 ELSE 0 END) AS average,
            SUM(CASE WHEN a.overall_score < 50 THEN 1 ELSE 0 END) AS weak
       FROM analyses a JOIN recordings r ON r.id = a.recording_id
      WHERE r.created_at >= datetime('now', ?)`
  ).bind(since).first<any>();

  // Past ballli o'qituvchilar (ogohlantirish).
  const alerts = await env.DB.prepare(
    `SELECT t.id AS teacher_id, t.full_name AS teacher_name, COUNT(a.id) AS lessons,
            ROUND(AVG(a.overall_score)) AS score
       FROM analyses a
       JOIN recordings r ON r.id = a.recording_id
       JOIN teachers t   ON t.id = r.teacher_id
      WHERE r.created_at >= datetime('now', ?)
      GROUP BY t.id HAVING score < 60
      ORDER BY score ASC LIMIT 5`
  ).bind(since).all();

  // So'nggi baholangan darslar.
  const recent = await env.DB.prepare(
    `SELECT r.id, r.topic, r.group_name, r.source_name, r.created_at, r.started_at,
            r.duration_seconds, s.display_name AS source_display,
            t.full_name AS teacher_name, sub.name AS subject_name, a.overall_score AS score
       FROM recordings r
       JOIN analyses a ON a.recording_id = r.id
       LEFT JOIN teachers t   ON t.id = r.teacher_id
       LEFT JOIN subjects sub ON sub.id = r.subject_id
       LEFT JOIN sources s    ON s.id = r.source_id
      WHERE r.status = 'done'
      ORDER BY a.created_at DESC LIMIT 6`
  ).all();

  // O'qituvchilar qamrovi.
  const coverage = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM teachers WHERE active = 1) AS total_teachers,
            (SELECT COUNT(DISTINCT teacher_id) FROM recordings WHERE teacher_id IS NOT NULL) AS with_lessons,
            (SELECT COUNT(DISTINCT teacher_id) FROM recordings
              WHERE teacher_id IS NOT NULL AND created_at >= datetime('now','-7 days')) AS active_7d`
  ).first<any>();

  // 14+ kun dars yozilmagan o'qituvchilar.
  const idle = await env.DB.prepare(
    `SELECT t.id AS teacher_id, t.full_name AS teacher_name, COUNT(r.id) AS lessons,
            MAX(r.created_at) AS last_lesson_at
       FROM teachers t JOIN recordings r ON r.teacher_id = t.id
      WHERE t.active = 1
      GROUP BY t.id HAVING last_lesson_at < datetime('now','-14 days')
      ORDER BY last_lesson_at ASC LIMIT 5`
  ).all();

  const n = (v: any) => Math.round(Number(v) || 0);

  return json({
    period_days: days,
    totals: {
      ...totals,
      total_minutes: n(totals?.total_minutes),
    },
    scores: score,
    daily: daily.results,
    top_teachers: topTeachers.results,
    by_source: bySource.results,
    week: {
      lessons:   { current: n(wk?.cur_lessons), previous: n(wk?.prev_lessons) },
      avg_score: { current: n(wk?.cur_score),   previous: n(wk?.prev_score) },
      minutes:   { current: n(wk?.cur_minutes), previous: n(wk?.prev_minutes) },
    },
    distribution: {
      excellent: n(dist?.excellent), good: n(dist?.good),
      average: n(dist?.average), weak: n(dist?.weak),
    },
    alerts: alerts.results,
    recent_lessons: recent.results,
    coverage: {
      total_teachers: n(coverage?.total_teachers),
      with_lessons: n(coverage?.with_lessons),
      active_7d: n(coverage?.active_7d),
    },
    idle_teachers: idle.results,
  });
}

/** Jonli holat — admin panel davriy so'raydi. */
export async function live(env: Env): Promise<Response> {
  const active = await env.DB.prepare(
    `SELECT r.id, r.recording_id, r.status, r.attempts, r.source_name,
            r.duration_seconds, r.updated_at,
            (SELECT message FROM processing_events pe
              WHERE pe.recording_id = r.id ORDER BY pe.id DESC LIMIT 1) AS last_message
       FROM recordings r
      WHERE r.status IN (${IN_PROGRESS})
      ORDER BY r.updated_at DESC LIMIT 50`
  ).all();

  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM recordings GROUP BY status`
  ).all();

  const lastWebhook = await env.DB.prepare(
    `SELECT created_at FROM recordings ORDER BY id DESC LIMIT 1`
  ).first<{ created_at: string }>();

  return json({
    active: active.results,
    counts: Object.fromEntries((counts.results as any[]).map((r) => [r.status, r.n])),
    last_webhook_at: lastWebhook?.created_at || null,
    server_time: new Date().toISOString(),
  });
}
