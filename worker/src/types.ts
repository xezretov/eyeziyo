export interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  JOBS: Queue<Job>;

  // vars
  GEMINI_MODEL?: string;
  AUDIOTAP_BASE_URL?: string;
  TARGET_PROFILE?: string;
  MAX_INGEST_MB?: string;
  STT_MODEL?: string;       // STT uchun birlamchi model (default gemini-2.5-flash)
  STT_CHUNK_SEC?: string;   // Ogg Opus bo'lak uzunligi (soniya), default 600
  STT_MODE?: string;        // "manual" (default): STT faqat biriktirishdan keyin; "auto": har yozuv darhol
  STT_DAILY_LIMIT_MIN?: string; // kunlik STT limiti (audio daqiqa), 0 = cheksiz
  STT_BATCH?: string;       // "on" (default): STT Gemini Batch orqali (50% narx); "off": sinxron
  STT_BATCH_MAX_HOURS?: string; // batch shu soatdan uzoq kutsa bekor + sinxron zaxira (default 36)

  // secrets
  GEMINI_API_KEY: string;
  JWT_SECRET: string;
  AUDIOTAP_WEBHOOK_SECRET: string;
}

/**
 * Secret qiymatlarini tozalaydi: `wrangler secret put` ga fayldan (PowerShell
 * UTF-8 BOM bilan yozadi) berilgan kalit boshida ko'rinmas U+FEFF va oxirida
 * yangi qator qolishi mumkin — Google shunda "API key not valid" qaytaradi.
 */
export function cleanEnv(env: Env): Env {
  const strip = (v: unknown) => {
    if (typeof v !== "string") return v;
    let s = v;
    while (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // U+FEFF (UTF-8 BOM)
    return s.trim();
  };
  return {
    ...env,
    GEMINI_API_KEY: strip(env.GEMINI_API_KEY) as string,
    JWT_SECRET: strip(env.JWT_SECRET) as string,
    AUDIOTAP_WEBHOOK_SECRET: strip(env.AUDIOTAP_WEBHOOK_SECRET) as string,
  };
}

/** Queue xabari. `ingest` = yuklab olish + STT, `analyze` = AI baholash. */
export type Job =
  | { type: "ingest"; recordingId: number; force?: boolean; sync?: boolean } // force: admin "qayta ishlash" — kesh/rejim/limit e'tiborsiz; sync: batch o'rniga sinxron STT
  | { type: "stt_collect"; recordingId: number } // batch tayyor — natijani olish (cron yuboradi)
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
