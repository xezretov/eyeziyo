/**
 * Audiotap webhook qabul qiluvchi.
 *
 * Audiotap (AES67 audio capture server) CloudEvents uslubida webhook yuboradi.
 * Biz `recording.available` ga obuna bo'lamiz: payload ichida artifact ro'yxati
 * va doimiy `download_url` bo'ladi.
 *
 * Eski (eyeziyo) loyihadan farqi:
 *  - Yuklab olish ctx.waitUntil emas, QUEUE orqali (retry + DLQ tekin keladi).
 *  - Secret majburiy: o'rnatilmagan bo'lsa endpoint 503 qaytaradi.
 *  - Faqat TARGET_PROFILE dagi artifact ishlanadi, qolgani "skipped".
 */
import { Env, json, err, logEvent } from "./types";

/** standard-webhooks: "v1,<base64 HMAC-SHA256>" over "{id}.{ts}.{body}" */
async function verifySignature(
  secret: string, webhookId: string, timestamp: string,
  rawBody: string, signatureHeader: string,
): Promise<boolean> {
  if (!webhookId || !timestamp || !signatureHeader) return false;

  // 5 daqiqadan eski yetkazib berish rad etiladi (replay himoyasi).
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, enc.encode(`${webhookId}.${timestamp}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));

  // Secret rotatsiyasida bir nechta nomzod bo'lishi mumkin.
  for (const cand of signatureHeader.split(/\s+/).filter(Boolean)) {
    const sig = cand.startsWith("v1,") ? cand.slice(3) : cand;
    if (sig.length !== expected.length) continue;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff === 0) return true;
  }
  return false;
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();

  if (!env.AUDIOTAP_WEBHOOK_SECRET) {
    console.error("AUDIOTAP_WEBHOOK_SECRET o'rnatilmagan — webhook rad etildi");
    return err("Webhook sozlanmagan", 503);
  }
  const ok = await verifySignature(
    env.AUDIOTAP_WEBHOOK_SECRET,
    request.headers.get("Webhook-Id") || "",
    request.headers.get("Webhook-Timestamp") || "",
    rawBody,
    request.headers.get("Webhook-Signature") || "",
  );
  if (!ok) return err("Imzo noto'g'ri", 401);

  let evt: any;
  try { evt = JSON.parse(rawBody); } catch { return err("JSON noto'g'ri", 400); }

  const eventType = String(evt?.type || "");
  const eventId = String(evt?.id || "");
  if (!eventId) return err("Event id yo'q", 400);

  // Faqat recording.available qayta ishlanadi; qolganini 200 bilan qaytaramiz,
  // aks holda audiotap keraksiz hodisalarni qayta yuboraveradi.
  if (eventType !== "recording.available") {
    return json({ ok: true, ignored: eventType });
  }

  const data = evt.data || {};
  const rec = data.recording || {};
  const recordingId = String(rec.id || evt.subject || "");
  const sourceName = String(data.audio_source?.name || "");
  const scheduleName = String(data.schedule?.name || "");
  const completeness = String(data.completeness?.status || "");
  const gapSeconds = Number(data.completeness?.gap_seconds_total || 0);
  const artifacts: any[] = Array.isArray(data.artifacts) ? data.artifacts : [];

  if (!recordingId || artifacts.length === 0) return err("recording/artifacts yo'q", 400);

  const target = (env.TARGET_PROFILE || "speech").toLowerCase();
  const enqueue: number[] = [];

  for (const art of artifacts) {
    const profile = String(art.profile || "");
    // Faqat kerakli profil ishlanadi — aks holda Gemini hisobi ikki barobar ketadi.
    const wanted = profile.toLowerCase() === target;
    const status = wanted ? "queued" : "skipped";

    const res = await env.DB.prepare(
      `INSERT INTO recordings (
         event_id, recording_id, event_type, source_name, schedule_name,
         profile, codec, container, size_bytes, duration_seconds, checksum_sha256,
         download_url, started_at, finalized_at, completeness, gap_seconds_total,
         status, payload
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(event_id, profile) DO NOTHING`
    ).bind(
      eventId, recordingId, eventType, sourceName, scheduleName,
      profile,
      String(art.codec || ""), String(art.container || ""),
      Number(art.size_bytes || 0),
      Number(art.duration_seconds || rec.duration_seconds || 0),
      String(art.checksum_sha256 || ""),
      String(art.download_url || ""),
      String(rec.started_at || ""), String(rec.finalized_at || ""),
      completeness, gapSeconds,
      status, rawBody.slice(0, 20000),
    ).run();

    if (!res.meta.changed_db) continue;   // dublikat — allaqachon bor
    const rowId = Number(res.meta.last_row_id);
    await logEvent(env.DB, rowId, "webhook", "ok", `profile=${profile} status=${status}`);
    if (wanted) enqueue.push(rowId);
  }

  // Manbani avtomatik ro'yxatga qo'shamiz (admin keyin nomlaydi).
  if (sourceName) {
    await env.DB.prepare(
      `INSERT INTO sources (audiotap_name, display_name) VALUES (?, ?)
       ON CONFLICT(audiotap_name) DO NOTHING`
    ).bind(sourceName, sourceName).run();
    await env.DB.prepare(
      `UPDATE recordings SET source_id = (SELECT id FROM sources WHERE audiotap_name = ?)
       WHERE event_id = ? AND source_id IS NULL`
    ).bind(sourceName, eventId).run();
  }

  // Navbatga qo'yamiz va DARHOL 200 qaytaramiz — audiotap kutmasin.
  for (const id of enqueue) {
    await env.JOBS.send({ type: "ingest", recordingId: id });
  }

  return json({ ok: true, accepted: enqueue.length, total: artifacts.length });
}
