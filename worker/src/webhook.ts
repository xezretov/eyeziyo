/**
 * Audiotap webhook qabul qiluvchi.
 *
 * Audiotap (AES67 audio capture server) CloudEvents uslubida webhook yuboradi.
 * Biz `recording.available` ga obuna bo'lamiz: payload ichida artifact ro'yxati
 * va doimiy `download_url` bo'ladi.
 *
 * Imzo (standard-webhooks): sarlavhalar
 *   Webhook-Id:        <hodisa id>
 *   Webhook-Timestamp: <unix soniya (yoki millisekund)>
 *   Webhook-Signature: v1,<base64(HMAC-SHA256(secret, "{id}.{timestamp}.{body}"))>
 *
 * Audiotap secret'ni qanday ko'rinishda ishlatishi (matn / hex / base64) turlicha
 * bo'lishi mumkin — shuning uchun kalit bir nechta variantda, imzo ham base64 va
 * hex ko'rinishida tekshiriladi. 401 javobda sabab aniq aytiladi (secret oshkor
 * bo'lmaydi), audiotap tomonini sozlash oson bo'lsin.
 *
 * D1 ishlamay qolsa (masalan bepul tarif kunlik limiti) payload R2 ga
 * `pending-webhooks/<event_id>.json` sifatida saqlanadi va 503 qaytariladi
 * (audiotap ham qayta yuborsin — dedup bor). Cron har 10 daqiqada va admin
 * Sozlamalar sahifasidagi tugma zaxiradagilarni qayta ishlaydi.
 */
import { Env, json, err, logEvent } from "./types";

const TOLERANCE_SEC = 5 * 60;
const PENDING_PREFIX = "pending-webhooks/";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function bytesToBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function tryBase64(s: string): Uint8Array | null {
  try {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    const bin = atob(pad);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { return null; }
}

/** Secret'ning mumkin bo'lgan bayt ko'rinishlari: matn, hex, base64 (whsec_ bilan/siz). */
function secretKeyVariants(secret: string): { name: string; bytes: Uint8Array }[] {
  const out: { name: string; bytes: Uint8Array }[] = [];
  const raw = secret.trim();
  const enc = new TextEncoder();
  out.push({ name: "utf8", bytes: enc.encode(raw) });
  const bare = raw.startsWith("whsec_") ? raw.slice(6) : raw;
  if (bare !== raw) out.push({ name: "utf8-nowhsec", bytes: enc.encode(bare) });
  if (/^[0-9a-f]+$/i.test(bare) && bare.length % 2 === 0) {
    out.push({ name: "hex", bytes: hexToBytes(bare) });
  }
  const b64 = tryBase64(bare);
  if (b64 && b64.length >= 16) out.push({ name: "base64", bytes: b64 });
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface VerifyResult { ok: boolean; reason?: string; keyVariant?: string }

async function verifySignature(
  secret: string, webhookId: string, timestamp: string,
  rawBody: string, signatureHeader: string,
): Promise<VerifyResult> {
  const missing = [
    !webhookId && "Webhook-Id", !timestamp && "Webhook-Timestamp", !signatureHeader && "Webhook-Signature",
  ].filter(Boolean);
  if (missing.length) return { ok: false, reason: `Sarlavha yo'q: ${missing.join(", ")}` };

  // Soniya yoki millisekund — ikkalasi ham qabul qilinadi (replay himoyasi 5 daqiqa).
  let ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "Webhook-Timestamp raqam emas" };
  if (ts > 1e12) ts = Math.floor(ts / 1000);
  const skew = Math.round(Date.now() / 1000 - ts);
  if (Math.abs(skew) > TOLERANCE_SEC) {
    return { ok: false, reason: `Webhook-Timestamp ${Math.abs(skew)}s ${skew > 0 ? "eski" : "kelajakda"} (ruxsat ${TOLERANCE_SEC}s) — server soatini tekshiring` };
  }

  // Imzo nomzodlari: "v1,<sig>" / "v1=<sig>" / "<sig>"; bo'sh joy bilan ajratilgan bir nechtasi bo'lishi mumkin.
  const candidates = signatureHeader.split(/\s+/).filter(Boolean)
    .map((c) => c.replace(/^v1[,=]/, ""));
  if (!candidates.length) return { ok: false, reason: "Webhook-Signature bo'sh" };

  const enc = new TextEncoder();
  const signed = enc.encode(`${webhookId}.${timestamp}.${rawBody}`);

  for (const variant of secretKeyVariants(secret)) {
    const key = await crypto.subtle.importKey("raw", variant.bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
    const expected = [bytesToBase64(mac), bytesToHex(mac)];
    for (const cand of candidates) {
      for (const exp of expected) {
        if (timingSafeEqual(cand, exp) || timingSafeEqual(cand.toLowerCase(), exp)) {
          return { ok: true, keyVariant: variant.name };
        }
      }
    }
  }
  return { ok: false, reason: "Imzo mos kelmadi — secret ikkala tomonda bir xilmi va imzo `{id}.{timestamp}.{body}` ustidan HMAC-SHA256 ekanini tekshiring" };
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();

  if (!env.AUDIOTAP_WEBHOOK_SECRET) {
    console.error("AUDIOTAP_WEBHOOK_SECRET o'rnatilmagan — webhook rad etildi");
    return err("Webhook sozlanmagan", 503);
  }
  const v = await verifySignature(
    env.AUDIOTAP_WEBHOOK_SECRET,
    request.headers.get("Webhook-Id") || "",
    request.headers.get("Webhook-Timestamp") || "",
    rawBody,
    request.headers.get("Webhook-Signature") || "",
  );
  if (!v.ok) {
    // Diagnostika logga: secret yoki imzo qiymati chiqmaydi, faqat sabab va sarlavha borligi.
    console.warn("Webhook 401:", v.reason, {
      hasId: Boolean(request.headers.get("Webhook-Id")),
      hasTs: Boolean(request.headers.get("Webhook-Timestamp")),
      sigPrefix: (request.headers.get("Webhook-Signature") || "").slice(0, 3),
      bodyLen: rawBody.length,
    });
    return err(`Imzo noto'g'ri: ${v.reason}`, 401);
  }

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
  console.log("Webhook qabul qilindi:", eventId, "imzo:", v.keyVariant, "hajm:", rawBody.length);

  try {
    const result = await ingestEvent(env, evt, rawBody, `imzo: ${v.keyVariant}`);
    return json({ ok: true, ...result });
  } catch (e: any) {
    // D1 ishlamayapti (masalan kunlik limit) — payload'ni R2 ga saqlab qo'yamiz,
    // cron / admin keyin qayta ishlaydi. 503 qaytaramiz: audiotap ham retry qilsin (dedup bor).
    const msg = e?.message || String(e);
    try {
      await env.AUDIO.put(`${PENDING_PREFIX}${eventId}.json`, rawBody, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { error: msg.slice(0, 200), receivedAt: new Date().toISOString() },
      });
      console.error("Webhook: D1 xatosi, payload R2 zaxiraga saqlandi:", eventId, msg);
      return err(`Baza vaqtincha ishlamayapti — hodisa saqlab qo'yildi, keyin avtomatik qayta ishlanadi (${msg.slice(0, 120)})`, 503);
    } catch (e2: any) {
      console.error("Webhook: D1 ham, R2 ham ishlamadi:", msg, e2?.message);
      return err(`Serverda xatolik: ${msg.slice(0, 120)}`, 503);
    }
  }
}

/** Hodisani D1 ga yozib navbatga qo'yadi. Webhook'dan ham, R2 zaxirasidan qayta ishlashda ham ishlatiladi. */
export async function ingestEvent(
  env: Env, evt: any, rawBody: string, note: string,
): Promise<{ accepted: number; total: number; profiles: string[]; target_profile: string }> {
  const eventType = String(evt?.type || "recording.available");
  const eventId = String(evt?.id || "");
  const data = evt.data || {};
  const rec = data.recording || {};
  const recordingId = String(rec.id || evt.subject || "");
  const sourceName = String(data.audio_source?.name || "");
  const scheduleName = String(data.schedule?.name || "");
  const completeness = String(data.completeness?.status || "");
  const gapSeconds = Number(data.completeness?.gap_seconds_total || 0);
  const artifacts: any[] = Array.isArray(data.artifacts) ? data.artifacts : [];

  if (!recordingId || artifacts.length === 0) throw new Error("recording/artifacts yo'q");

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
    await logEvent(env.DB, rowId, "webhook", "ok", `profile=${profile} status=${status} (${note})`);
    if (wanted) enqueue.push(rowId);
  }

  // Hech bir artifact kerakli profilda bo'lmasa — bu sozlama xatosi, logda ko'rinsin.
  if (!artifacts.some((a) => String(a.profile || "").toLowerCase() === target)) {
    console.warn(`Webhook: hech bir artifact TARGET_PROFILE="${target}" ga mos emas. Kelgan profillar:`,
      artifacts.map((a) => a.profile).join(", "));
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

  // Navbatga qo'yamiz va DARHOL qaytamiz — audiotap kutmasin.
  for (const id of enqueue) {
    await env.JOBS.send({ type: "ingest", recordingId: id });
  }

  return {
    accepted: enqueue.length, total: artifacts.length,
    profiles: artifacts.map((a) => String(a.profile || "")), target_profile: target,
  };
}

/** R2 zaxirasidagi (D1 ishlamaganda saqlangan) hodisalarni qayta ishlaydi. */
export async function replayPendingWebhooks(env: Env): Promise<{ pending: number; replayed: number; failed: number; error?: string }> {
  const list = await env.AUDIO.list({ prefix: PENDING_PREFIX, limit: 100 });
  let replayed = 0, failed = 0, error: string | undefined;
  for (const obj of list.objects) {
    try {
      const o = await env.AUDIO.get(obj.key);
      if (!o) continue;
      const raw = await o.text();
      const evt = JSON.parse(raw);
      await ingestEvent(env, evt, raw, "R2 zaxiradan qayta ishlandi");
      await env.AUDIO.delete(obj.key);
      replayed++;
    } catch (e: any) {
      failed++;
      error = e?.message || String(e);
      console.error("Replay xatosi:", obj.key, error);
      // D1 hali ishlamayotgan bo'lsa qolganlarini urinib o'tirmaymiz.
      if (/D1_ERROR|row read limit/i.test(error || "")) break;
    }
  }
  return { pending: list.objects.length - replayed, replayed, failed, error };
}

export async function countPendingWebhooks(env: Env): Promise<number> {
  const list = await env.AUDIO.list({ prefix: PENDING_PREFIX, limit: 1000 });
  return list.objects.length;
}
