// ═══════════════════════════════════════════════════════
// Audiotap webhook integration
//
// Audiotap (AES67 audio capture server) delivers CloudEvents-style webhooks.
// We subscribe to `recording.available`: the payload lists export artifacts
// with a permanent `download_url`. On receipt we persist the event to D1 and
// download the audio into R2 in the background (ctx.waitUntil).
//
// Endpoints wired in index.ts:
//   POST /api/webhooks/audiotap                      — webhook receiver (HMAC verified)
//   GET  /api/admin/audiotap/recordings              — list received recordings (admin)
//   GET  /api/admin/audiotap/recordings/:id/audio    — stream stored audio from R2 (admin)
//   POST /api/admin/audiotap/recordings/:id/retry    — re-download a failed artifact (admin)
//
// Config:
//   AUDIOTAP_BASE_URL        (var)    — public base URL of the audiotap API, e.g.
//                                       "https://audiotap.example.uz/api". The webhook
//                                       payload's download_url host (often "localhost")
//                                       is rewritten to this base.
//   AUDIOTAP_WEBHOOK_SECRET  (secret) — shared secret registered on the audiotap
//                                       webhook target. When set, deliveries are
//                                       verified: Webhook-Signature = "v1,<base64
//                                       HMAC-SHA256>" over "{Webhook-Id}.{Webhook-
//                                       Timestamp}.{raw body}".
// ═══════════════════════════════════════════════════════

export interface AudiotapEnv {
  DB: D1Database;
  AUDIO_BUCKET?: R2Bucket;
  AUDIOTAP_BASE_URL?: string;
  AUDIOTAP_WEBHOOK_SECRET?: string;
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Signature verification ──
// Format (standard-webhooks compatible): "v1,<base64>" — multiple whitespace-
// separated candidates may be present during secret rotation.
async function verifySignature(
  secret: string,
  webhookId: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string
): Promise<boolean> {
  if (!webhookId || !timestamp || !signatureHeader) return false;

  // Reject stale deliveries (>5 min skew) to blunt replay attacks.
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC", key, encoder.encode(`${webhookId}.${timestamp}.${rawBody}`)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));

  // Constant-time compare against each candidate.
  const candidates = signatureHeader.split(/\s+/).filter(Boolean);
  for (const cand of candidates) {
    const sig = cand.startsWith("v1,") ? cand.slice(3) : cand;
    if (sig.length === expected.length) {
      let diff = 0;
      for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
      if (diff === 0) return true;
    }
  }
  return false;
}

// ── Download URL rewrite ──
// Webhook payloads carry "http://localhost/api/recordings/..." — rewrite the
// origin to AUDIOTAP_BASE_URL so the Worker can actually reach the server.
function resolveDownloadUrl(rawUrl: string, baseUrl?: string): string | null {
  if (!rawUrl) return null;
  if (!baseUrl) return rawUrl;
  try {
    const u = new URL(rawUrl);
    const base = new URL(baseUrl);
    // Base may include a path prefix (e.g. /api); replace payload's origin+"/api".
    const basePath = base.pathname.replace(/\/$/, "");
    let path = u.pathname;
    // Avoid double "/api" when both base and payload path carry it.
    if (basePath.endsWith("/api") && path.startsWith("/api/")) {
      path = path.slice(4);
    }
    return `${base.origin}${basePath}${path}${u.search}`;
  } catch {
    return null;
  }
}

// ── Webhook receiver ──
export async function handleAudiotapWebhook(
  request: Request,
  env: AudiotapEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const rawBody = await request.text();

  // Verify HMAC when a secret is configured. Without a secret the endpoint
  // still works but is unauthenticated — set AUDIOTAP_WEBHOOK_SECRET in prod.
  if (env.AUDIOTAP_WEBHOOK_SECRET) {
    const ok = await verifySignature(
      env.AUDIOTAP_WEBHOOK_SECRET,
      request.headers.get("Webhook-Id") || "",
      request.headers.get("Webhook-Timestamp") || "",
      rawBody,
      request.headers.get("Webhook-Signature") || ""
    );
    if (!ok) return json({ detail: "Imzo noto'g'ri" }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ detail: "JSON emas" }, 400);
  }

  const eventType = String(event?.type || "");
  const eventId = String(event?.id || "");
  if (!eventId) return json({ detail: "Event id yo'q" }, 400);

  // We only ingest recording.available; ack everything else so audiotap
  // doesn't retry events we intentionally ignore.
  if (eventType !== "recording.available") {
    return json({ ok: true, ignored: eventType });
  }

  const data = event.data || {};
  const recording = data.recording || {};
  const recordingId = String(recording.id || event.subject || "");
  const artifacts: any[] = Array.isArray(data.artifacts) ? data.artifacts : [];
  if (!recordingId || artifacts.length === 0) {
    return json({ detail: "recording/artifacts yo'q" }, 400);
  }

  const sourceName = String(data.audio_source?.name || "");
  const scheduleName = String(data.schedule?.name || "");
  const completeness = String(data.completeness?.status || "");
  const gapSeconds = Number(data.completeness?.gap_seconds_total || 0);

  const insertedIds: number[] = [];
  for (const art of artifacts) {
    const profile = String(art.profile || "");
    // Dedup: one row per CloudEvent+profile. Redeliveries are acked silently.
    const existing = await env.DB.prepare(
      "SELECT id FROM audiotap_recordings WHERE event_id = ? AND profile = ?"
    ).bind(eventId, profile).first();
    if (existing) continue;

    const res = await env.DB.prepare(`
      INSERT INTO audiotap_recordings
        (event_id, recording_id, event_type, source_name, schedule_name,
         profile, codec, container, size_bytes, duration_seconds, checksum_sha256,
         download_url, started_at, finalized_at, completeness, gap_seconds_total,
         status, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)
    `).bind(
      eventId, recordingId, eventType, sourceName, scheduleName,
      profile, String(art.codec || ""), String(art.container || ""),
      Number(art.size_bytes || 0), Number(art.duration_seconds || 0),
      String(art.checksum_sha256 || ""),
      String(art.download_url || ""),
      String(recording.started_at || ""), String(recording.finalized_at || ""),
      completeness, gapSeconds,
      rawBody
    ).run();
    insertedIds.push(Number(res.meta.last_row_id));
  }

  // Download the audio in the background — respond to audiotap immediately
  // so the delivery isn't marked failed by its 10s timeout.
  if (insertedIds.length > 0) {
    ctx.waitUntil(Promise.allSettled(insertedIds.map(id => downloadArtifact(env, id))));
  }

  return json({ ok: true, recording_id: recordingId, artifacts: insertedIds.length });
}

// ── Background download → R2 ──
async function downloadArtifact(env: AudiotapEnv, rowId: number): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT * FROM audiotap_recordings WHERE id = ?"
  ).bind(rowId).first<any>();
  if (!row) return;

  const setStatus = (status: string, extra: { r2_key?: string; error?: string } = {}) =>
    env.DB.prepare(
      "UPDATE audiotap_recordings SET status = ?, r2_key = COALESCE(?, r2_key), error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(status, extra.r2_key ?? null, extra.error || "", rowId).run();

  if (!env.AUDIO_BUCKET) {
    await setStatus("failed", { error: "AUDIO_BUCKET (R2) sozlanmagan" });
    return;
  }

  const url = resolveDownloadUrl(row.download_url, env.AUDIOTAP_BASE_URL);
  if (!url) {
    await setStatus("failed", { error: "download_url ni aniqlab bo'lmadi" });
    return;
  }

  await setStatus("downloading");
  try {
    // Audiotap /download replies 307 → presigned URL; fetch follows it.
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok || !res.body) {
      await setStatus("failed", { error: `Yuklab olish xatosi: HTTP ${res.status}` });
      return;
    }

    const ext = row.container || "bin";
    const key = `audiotap/${row.recording_id}/${row.profile || "audio"}.${ext}`;
    const contentType = res.headers.get("Content-Type")
      || (ext === "flac" ? "audio/flac" : ext === "ogg" ? "audio/ogg" : "application/octet-stream");

    await env.AUDIO_BUCKET.put(key, res.body, {
      httpMetadata: { contentType },
      customMetadata: {
        recording_id: String(row.recording_id),
        profile: String(row.profile || ""),
        checksum_sha256: String(row.checksum_sha256 || ""),
      },
    });

    await setStatus("stored", { r2_key: key });
  } catch (e: any) {
    await setStatus("failed", { error: String(e?.message || e).slice(0, 500) });
  }
}

// ── Admin: list recordings ──
export async function handleAudiotapList(request: Request, env: AudiotapEnv): Promise<Response> {
  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50;
  const status = url.searchParams.get("status") || "";

  const rows = status
    ? await env.DB.prepare(
        `SELECT id, event_id, recording_id, source_name, schedule_name, profile, codec,
                container, size_bytes, duration_seconds, started_at, finalized_at,
                completeness, gap_seconds_total, status, r2_key, error, created_at, updated_at
         FROM audiotap_recordings WHERE status = ? ORDER BY created_at DESC LIMIT ?`
      ).bind(status, limit).all()
    : await env.DB.prepare(
        `SELECT id, event_id, recording_id, source_name, schedule_name, profile, codec,
                container, size_bytes, duration_seconds, started_at, finalized_at,
                completeness, gap_seconds_total, status, r2_key, error, created_at, updated_at
         FROM audiotap_recordings ORDER BY created_at DESC LIMIT ?`
      ).bind(limit).all();

  return json(rows.results || []);
}

// ── Admin: stream stored audio from R2 ──
export async function handleAudiotapAudio(env: AudiotapEnv, rowId: number): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT r2_key, status, container FROM audiotap_recordings WHERE id = ?"
  ).bind(rowId).first<any>();
  if (!row) return json({ detail: "Yozuv topilmadi" }, 404);
  if (row.status !== "stored" || !row.r2_key) {
    return json({ detail: `Audio hali saqlanmagan (status: ${row.status})` }, 409);
  }
  if (!env.AUDIO_BUCKET) return json({ detail: "AUDIO_BUCKET sozlanmagan" }, 503);

  const obj = await env.AUDIO_BUCKET.get(row.r2_key);
  if (!obj) return json({ detail: "R2 da fayl topilmadi" }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Length", String(obj.size));
  headers.set("Content-Disposition", `attachment; filename="${row.r2_key.split("/").pop()}"`);
  return new Response(obj.body, { headers });
}

// ── Admin: retry a failed download ──
export async function handleAudiotapRetry(
  env: AudiotapEnv,
  ctx: ExecutionContext,
  rowId: number
): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT id, status FROM audiotap_recordings WHERE id = ?"
  ).bind(rowId).first<any>();
  if (!row) return json({ detail: "Yozuv topilmadi" }, 404);
  if (row.status === "stored") return json({ detail: "Allaqachon saqlangan" }, 409);

  ctx.waitUntil(downloadArtifact(env, rowId));
  return json({ ok: true, id: rowId, status: "downloading" });
}
