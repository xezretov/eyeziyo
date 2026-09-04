export interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  JOBS: Queue<Job>;

  // vars
  GEMINI_MODEL?: string;
  AUDIOTAP_BASE_URL?: string;
  TARGET_PROFILE?: string;
  MAX_INGEST_MB?: string;

  // secrets
  GEMINI_API_KEY: string;
  JWT_SECRET: string;
  AUDIOTAP_WEBHOOK_SECRET: string;
}

/** Queue xabari. `ingest` = yuklab olish + STT, `analyze` = AI baholash. */
export type Job =
  | { type: "ingest"; recordingId: number }
  | { type: "analyze"; recordingId: number };

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

export function err(detail: string, status = 400): Response {
  return json({ detail }, status);
}

/** Audiotap container → Gemini mime type. */
export function mimeFor(container: string, codec: string): string {
  const c = (container || "").toLowerCase();
  const k = (codec || "").toLowerCase();
  if (c === "ogg" || k === "opus" || k === "vorbis") return "audio/ogg";
  if (c === "flac" || k === "flac") return "audio/flac";
  if (c === "wav" || k === "pcm") return "audio/wav";
  if (c === "mp3" || k === "mp3") return "audio/mpeg";
  if (c === "m4a" || c === "mp4" || k === "aac") return "audio/mp4";
  return "audio/ogg";
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function logEvent(
  db: D1Database, recordingId: number, stage: string,
  status: string, message = "", durationMs = 0,
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO processing_events (recording_id, stage, status, message, duration_ms)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(recordingId, stage, status, message.slice(0, 500), durationMs).run();
  } catch { /* jurnal — best-effort */ }
}

export async function setStatus(
  db: D1Database, id: number, status: string, error = "",
): Promise<void> {
  await db.prepare(
    `UPDATE recordings SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(status, error.slice(0, 500), id).run();
}
