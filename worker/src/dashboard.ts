/** Jonli konveyer holati (admin dashboard "Jonli jarayon" bloki). */
import { Env, json } from "./types";

const IN_PROGRESS = `'queued','downloading','stored','transcribing','analyzing'`;

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
