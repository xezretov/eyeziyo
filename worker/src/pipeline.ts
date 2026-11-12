/**
 * Qayta ishlash konveyeri (Queue consumer ichida ishlaydi).
 *
 *   ingest:      download_url → (checksum) → R2 → [STT_MODE=manual: biriktirilmagan bo'lsa
 *                awaiting_assignment] → Ogg bo'laklash → STT:
 *                  - STT_BATCH=on (default): bo'laklar Files API ga yuklanadi, bitta Gemini
 *                    Batch job yaratiladi (narx 50%), status = stt_batch. Cron har 10 daqiqada
 *                    job holatini tekshiradi (pollSttBatches) → tayyor bo'lsa stt_collect.
 *                  - sync (STT_BATCH=off yoki batch yiqilganda zaxira): bo'laklar ketma-ket
 *                    generateContent bilan.
 *   stt_collect: batch natijasini olish → bo'sh/sikl bo'laklar sinxron qayta → polish →
 *                stt_chunks → transcripts → analyze (biriktirilgan) / awaiting_assignment
 *   analyze:     transcript + qo'lda biriktirilgan o'qituvchi/fan/mavzu
 *                → lessons (dars) + Gemini 5 mezon → evaluations → status = done
 *
 * NIMA UCHUN IKKI BOSQICH: o'qituvchi/fan/mavzu QO'LDA biriktiriladi, ammo
 * baholash prompti aynan shu kontekstni talab qiladi (topic_score fanga
 * mosligini o'lchaydi).
 *
 * Xarajat (2026-09-22): audiotap har 1.5 soatda 80 daq yozuv yuboradi (dars bo'lmasa ham);
 * avtomatik STT + takroriy o'tishlar bilan ~$24 ketgan. Shuning uchun: STT faqat
 * biriktirishdan keyin, bo'lak keshi (stt_chunks), kunlik limit, Batch (50%).
 *
 * ESLATMA: Workers'da ffmpeg yo'q. Ogg Opus fayl sahifa darajasida ~10 daqiqalik
 * bo'laklarga bo'linadi (src/ogg.ts) va har biri alohida STT qilinadi — bitta
 * so'rovda 80 daqiqalik audio ishonchsiz. Boshqa formatlar (flac/wav) butunligicha
 * yuboriladi: 14MB gacha inline, kattasi Files API orqali.
 */
import { Env, Job, mimeFor, sha256Hex, logEvent, setStatus } from "./types";
import {
  transcribeAudioFile, polishTranscript, evaluateLesson,
  transcriptionInstruction, uploadAudioToGeminiFiles, cleanTranscriptChunk,
  createSttBatch, getSttBatch, cancelSttBatch, GeminiUsage, usageUsd, relabelMediaSegments,
} from "./gemini";
import { splitOggOpus, OggChunk } from "./ogg";
import { normalizeChunk, computeStats, collapseCycles, hasMarkers, parseLabeled, relabelByTime, fmtClock } from "./timeline";

/** Haqiqiy so'zlar soni: kamida 2 harfli tokenlar (nuqta/belgilar qatori hisoblanmaydi). */
function realWords(text: string): number {
  return text.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length;
}

function fmtRange(ch: OggChunk): string {
  const m = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return `${m(ch.startSec)}–${m(ch.endSec)}`;
}

function resolveDownloadUrl(rawUrl: string, baseUrl?: string): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    // Payload allaqachon tashqi manzil bergan bo'lsa (masalan Tailscale *.ts.net) —
    // o'zgartirmaymiz. Faqat localhost / xususiy IP bo'lsa AUDIOTAP_BASE_URL bilan almashtiriladi.
    const isLocal = /^(localhost|127[.]|0[.]0[.]0[.]0|10[.]|192[.]168[.]|172[.](1[6-9]|2\d|3[01])[.])/i.test(u.hostname);
    if (!isLocal) return rawUrl;
    if (!baseUrl || /localhost|127[.]0[.]0[.]1/.test(baseUrl)) return rawUrl;
    const base = new URL(baseUrl);
    const basePath = base.pathname.replace(/\/$/, "");
    let path = u.pathname;
    if (basePath.endsWith("/api") && path.startsWith("/api/")) path = path.slice(4);
    return `${base.origin}${basePath}${path}${u.search}`;
  } catch { return null; }
}

/**
 * Faylni HTTP Range bilan 2 MB bo'laklab yuklash; har bo'lak 5 martagacha qayta uriladi.
 * Server Range'ni qo'llamasa (200 qaytarsa) — butun javob olinadi (eski xatti-harakat).
 */
async function downloadRanged(url: string): Promise<{ buf: ArrayBuffer; parts: number; retries: number }> {
  const PART = 2 * 1024 * 1024;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let retries = 0;
  const getRange = async (u: string, a: number, b: number): Promise<Response> => {
    let lastErr: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(u, { redirect: "follow", headers: { Range: `bytes=${a}-${b}` } });
        if (res.status === 206 || res.status === 200) return res;
        lastErr = new Error(`Yuklab olish xatosi: HTTP ${res.status}`);
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
      } catch (e) { lastErr = e; }
      retries++;
      await sleep(3000 * (attempt + 1));
    }
    throw lastErr;
  };

  // Birinchi bo'lak: umumiy hajm (Content-Range) va redirectdan keyingi yakuniy URL.
  const first = await getRange(url, 0, PART - 1);
  if (first.status === 200) return { buf: await first.arrayBuffer(), parts: 1, retries };
  const total = Number((first.headers.get("content-range") || "").split("/")[1]);
  const finalUrl = first.url || url;
  const head = new Uint8Array(await first.arrayBuffer());
  if (!Number.isFinite(total) || total <= head.byteLength) return { buf: head.buffer, parts: 1, retries };

  const out = new Uint8Array(total);
  out.set(head, 0);
  let off = head.byteLength, parts = 1;
  while (off < total) {
    const end = Math.min(total, off + PART) - 1;
    let chunk: Uint8Array | null = null;
    for (let attempt = 0; attempt < 5 && !chunk; attempt++) {
      try {
        // Presigned URL eskirgan bo'lsa (403) — asl /download manzildan qayta redirect olinadi.
        const res = await getRange(attempt < 2 ? finalUrl : url, off, end);
        const b = new Uint8Array(await res.arrayBuffer());
        if (res.status === 206 && b.byteLength === end - off + 1) chunk = b;
        else throw new Error(`bo'lak hajmi mos emas: ${b.byteLength}`);
      } catch (e) {
        if (attempt === 4) throw e;
        retries++;
        await sleep(3000 * (attempt + 1));
      }
    }
    out.set(chunk as Uint8Array, off);
    off = end + 1;
    parts++;
  }
  return { buf: out.buffer, parts, retries };
}

export async function runJob(job: Job, env: Env): Promise<void> {
  if (job.type === "ingest") return ingest(env, job.recordingId, Boolean(job.force), Boolean(job.sync));
  if (job.type === "stt_collect") return collectBatch(env, job.recordingId);
  if (job.type === "analyze") return analyze(env, job.recordingId);
}

// ═══════════════════════════════════════════════════════════════
// Umumiy yordamchilar (STT)
// ═══════════════════════════════════════════════════════════════

type Ctx = { subject: string; topic: string; assigned: boolean };
type ChunkRow = { idx: number; total: number; text: string; model: string; note: string };

async function loadContext(env: Env, id: number): Promise<Ctx> {
  const r = await env.DB.prepare(
    `SELECT r.topic, r.teacher_id, s.name AS subject
       FROM recordings r LEFT JOIN subjects s ON s.id = r.subject_id
      WHERE r.id = ?`
  ).bind(id).first<any>();
  return {
    subject: r?.subject || "Aniqlanmagan fan",
    topic: r?.topic || "Aniqlanmagan mavzu",
    assigned: Boolean(r?.teacher_id && r?.subject && r?.topic),
  };
}

/** Gemini chaqiruvlari tokenlarini gemini_usage ga yozadi, jami USD ni qaytaradi. */
async function recordUsage(env: Env, id: number, stage: string, list: GeminiUsage[]): Promise<number> {
  let total = 0;
  for (const u of list) {
    const usd = usageUsd(u);
    total += usd;
    await env.DB.prepare(
      `INSERT INTO gemini_usage (recording_id, stage, model, batch, audio_in, text_in, out_tokens, usd)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, stage, u.model, u.batch ? 1 : 0, u.audioIn, u.textIn, u.out, usd).run().catch(() => {});
  }
  return total;
}
const fmtUsd = (v: number) => "$" + (v < 0.01 ? v.toFixed(4) : v.toFixed(3));

/** R2 dagi audio (r2_key). */
async function loadAudio(env: Env, row: any): Promise<Uint8Array> {
  if (!row?.r2_key) throw new Error("Audio R2 da yo'q — \"Qayta ishlash → yuklab olish\"");
  const obj = await env.AUDIO.get(row.r2_key).catch(() => null);
  if (!obj) throw new Error("Audio R2 dan topilmadi — \"Qayta ishlash → yuklab olish\"");
  return new Uint8Array(await obj.arrayBuffer());
}

/** Uzun Ogg Opus → ~10 daqiqalik bo'laklar (src/ogg.ts). Ogg bo'lmasa — bitta bo'lak. */
function splitForStt(env: Env, bytes: Uint8Array): { chunks: OggChunk[]; chunkSec: number } {
  const chunkSec = Math.max(120, parseInt(env.STT_CHUNK_SEC || "600", 10) || 600);
  return { chunks: splitOggOpus(bytes, chunkSec, 120), chunkSec };
}

/** Bo'lak keshi (stt_chunks) — qayta yuborilganda tayyor bo'laklar qayta STT qilinmaydi. */
async function loadChunkCache(env: Env, id: number, total: number): Promise<Map<number, ChunkRow>> {
  const cached = new Map<number, ChunkRow>();
  const cr = await env.DB.prepare(
    `SELECT idx, total, text, model, note FROM stt_chunks WHERE recording_id = ?`
  ).bind(id).all<any>();
  for (const c of cr.results) if (Number(c.total) === total) cached.set(Number(c.idx), c);
  return cached;
}

async function saveChunk(env: Env, id: number, total: number, ch: OggChunk, text: string, model: string, note: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO stt_chunks (recording_id, idx, total, start_sec, end_sec, text, model, note)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(id, ch.index, total, ch.startSec, ch.endSec, text, model, note).run();
}

/**
 * Bitta bo'lakni sinxron STT qilish (generateContent):
 *  - HTTP xato (429/5xx, hech bir model javob bermadi) → 20 s kutib 3 martagacha qayta;
 *    baribir bo'lmasa istisno — butun ish Queue tomonidan keyinroq qayta uriladi.
 *  - Sikl (ikkala temperature'da ham) → bo'lakni ikki yarmiga bo'lib alohida STT (bir daraja).
 *    Yarmlar faqat t=0.3 bilan — bo'lakka maksimal 4 chaqiruv (avval 6 edi).
 */
async function sttChunkSync(
  env: Env, ctx: Ctx, mime: string, bytes: Uint8Array, durSec: number, depth: number,
  mode: "full" | "light" = "full", acc: GeminiUsage[] = [],
): Promise<{ text: string; model: string; note: string }> {
  const sttModel = env.STT_MODEL || "gemini-2.5-flash";
  // light (batch'dan keyingi qayta urinish): faqat t=0.3, bitta chaqiruv, yarmlarga bo'linmaydi —
  // batch allaqachon bir marta pul olgan, ikkinchi to'liq narxli urinish bilan cheklanamiz.
  const temps = mode === "light" || depth > 0 ? [0.3] : undefined;
  let r = await transcribeAudioFile(env.GEMINI_API_KEY, bytes, mime, ctx.subject, ctx.topic, sttModel, temps);
  if (r.usage) acc.push(...r.usage);
  for (let retry = 1; r.httpError && retry <= 2; retry++) {
    await new Promise((res) => setTimeout(res, 20000));
    r = await transcribeAudioFile(env.GEMINI_API_KEY, bytes, mime, ctx.subject, ctx.topic, sttModel, temps);
    if (r.usage) acc.push(...r.usage);
  }
  if (r.httpError) throw new Error(`Gemini STT javob bermadi (${r.errorDetail || "429/5xx"}) — keyinroq qayta uriladi`);

  if (r.looped && depth < 1 && durSec >= 240 && mode !== "light") {
    const halves = splitOggOpus(bytes, Math.ceil(durSec / 2), 30);
    if (halves.length > 1) {
      const outs: string[] = [];
      const ms = new Set<string>();
      for (const h of halves) {
        const hr = await sttChunkSync(env, ctx, mime, h.bytes, h.endSec - h.startSec, depth + 1, mode, acc);
        // Yarm ichidagi vaqt yarm boshidan — bo'lak boshiga nisbatan vaqtga o'giramiz.
        if (hr.text) { outs.push(normalizeChunk(hr.text, h.startSec, h.endSec)); if (hr.model) ms.add(hr.model); }
      }
      const joined = outs.join("\n\n");
      // Yarmlar ko'proq so'z bersa — ularni olamiz, aks holda asl natija qoladi.
      if (realWords(joined) > realWords(r.transcript)) {
        return { text: joined, model: [...ms].join("+"), note: ` [sikl → ${halves.length} yarm]` };
      }
    }
    return { text: r.transcript, model: r.model, note: " [sikl]" };
  }
  return { text: r.transcript, model: r.model, note: "" };
}

/** Xom STT matnini polish qilib keshga yozadi (bo'sh bo'lsa "" saqlanadi). */
async function storeChunkResult(
  env: Env, id: number, total: number, ctx: Ctx, ch: OggChunk,
  transcript: string, model: string, note: string, tc: number, acc: GeminiUsage[] = [],
): Promise<void> {
  // "So'z" = kamida 2 harfli token; "......" / "ммм" kabi shovqin chiqindisi hisobga olinmaydi.
  if (!transcript || realWords(transcript) < 5) {
    await saveChunk(env, id, total, ch, "", model || "", note);
    const usd0 = await recordUsage(env, id, "stt", acc);
    if (total > 1) {
      await logEvent(env.DB, id, "transcribe", "warn",
        `bo'lak ${ch.index + 1}/${total} (${fmtRange(ch)}) bo'sh (nutq topilmadi)${acc.length ? ", " + fmtUsd(usd0) : ""}`, Date.now() - tc);
    }
    return;
  }
  // Polish har bo'lak uchun alohida — kichik matnda ishonchli, token limitiga urilmaydi.
  const polished = await polishTranscript(env.GEMINI_API_KEY, transcript, ctx.subject, ctx.topic, (u) => acc.push(u))
    .catch(() => transcript);
  // Yorliqlardagi bo'lak ichidagi vaqt → yozuv boshidan mutlaq vaqt.
  const piece = normalizeChunk((polished || transcript).trim(), ch.startSec, ch.endSec);
  await saveChunk(env, id, total, ch, piece, model || "", note);
  const usd = await recordUsage(env, id, "stt", acc);
  if (total > 1) {
    await logEvent(env.DB, id, "transcribe", "ok",
      `bo'lak ${ch.index + 1}/${total} (${fmtRange(ch)}): ${realWords(piece)} so'z, ${model}${note}, ${fmtUsd(usd)}`,
      Date.now() - tc);
  }
}

/** Berilgan bo'laklarni ketma-ket sinxron STT qilib keshga yozadi. */
async function transcribeChunksSync(
  env: Env, id: number, row: any, ctx: Ctx, chunks: OggChunk[], total: number,
  mode: "full" | "light" = "full",
): Promise<void> {
  const mime = mimeFor(row.container, row.codec);
  for (const ch of chunks) {
    const tc = Date.now();
    const durSec = total > 1 ? ch.endSec - ch.startSec : Number(row.duration_seconds) || 0;
    const acc: GeminiUsage[] = [];
    const { text, model, note } = await sttChunkSync(env, ctx, mime, ch.bytes, durSec, 0, mode, acc);
    await storeChunkResult(env, id, total, ctx, ch, text, model, note, tc, acc);
  }
}

/**
 * Keshdagi barcha bo'laklardan transkript yig'ish → transcripts → analyze / awaiting_assignment.
 * Sync va batch yo'llari shu yerda birlashadi.
 */
async function finalizeTranscript(env: Env, id: number, total: number, ctx: Ctx, t1: number): Promise<void> {
  const rows = (await env.DB.prepare(
    `SELECT idx, total, text, model, note FROM stt_chunks WHERE recording_id = ? AND total = ? ORDER BY idx`
  ).bind(id, total).all<any>()).results as ChunkRow[];
  if (rows.length < total) throw new Error(`Bo'laklar to'liq emas: ${rows.length}/${total}`);

  const parts = rows.map((r) => r.text).filter(Boolean);
  const emptyChunks = rows.length - parts.length;
  const models = new Set<string>();
  rows.forEach((r) => { if (r.text && r.model) models.add(r.model); });
  let text = parts.join("\n\n");
  // Yorliqli transkript: yorliqlar orasidagi takrorlash sikli yig'iladi, keyin butun dars bo'yicha
  // matnli tekshiruv dublyaj/diktor parchalarini VIDEO ga o'tkazadi (2026-09-28, #73).
  if (hasMarkers(text)) {
    text = collapseCycles(text);
    const acc: GeminiUsage[] = [];
    const rl = await relabelMediaSegments(env.GEMINI_API_KEY, text, ctx.subject, ctx.topic, (u) => acc.push(u));
    const usd = await recordUsage(env, id, "stt", acc);
    text = rl.text;
    await logEvent(env.DB, id, "transcribe", "info", `manba tekshiruvi: ${rl.changed} parcha qayta belgilandi, video bloklari: ${rl.blocks || "—"}, ${fmtUsd(usd)}`.slice(0, 480));
  }

  // Butun yozuvda 30 dan kam haqiqiy so'z — nutq yo'q (jimlik, shovqin, mikrofon
  // nosozligi; 2026-09-14 12:23 yozuvi: -15 dB doimiy shovqin, Whisper ham 0 so'z).
  // Chiqindini transkript sifatida saqlamaymiz — admin aniq sababni ko'rsin.
  if (parts.length === 0 || realWords(text) < 30) {
    throw new Error(
      `Nutq topilmadi — ${emptyChunks}/${total} bo'lak bo'sh, jami ${realWords(text)} so'z. ` +
      `Audio jimlik/shovqin bo'lishi mumkin (mikrofon va xonani tekshiring).`
    );
  }
  if (emptyChunks > 0) {
    await logEvent(env.DB, id, "transcribe", "warn", `${emptyChunks}/${total} bo'lak bo'sh — transkript to'liq emas`);
  }
  const model = [...models].join("+");
  // Ovoz manbalari statistikasi (O'QITUVCHI / TALABA / VIDEO / jimlik) — yorliqli transkriptda.
  const durRow = await env.DB.prepare(`SELECT duration_seconds FROM recordings WHERE id = ?`).bind(id).first<any>();
  const stats = computeStats(text, Number(durRow?.duration_seconds) || 0);

  await env.DB.prepare(
    `INSERT INTO transcripts (recording_id, text, char_count, word_count, model, stats)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(recording_id) DO UPDATE SET
       text = excluded.text, char_count = excluded.char_count,
       word_count = excluded.word_count, model = excluded.model, stats = excluded.stats`
  ).bind(id, text, text.length, text.split(/\s+/).filter(Boolean).length, model, stats ? JSON.stringify(stats) : "").run();

  const spent = await env.DB.prepare(`SELECT COALESCE(SUM(usd),0) AS usd, COUNT(*) AS n FROM gemini_usage WHERE recording_id = ?`).bind(id).first<any>().catch(() => null);
  await logEvent(env.DB, id, "transcribe", "ok", `${text.length} belgi, ${model}${spent ? `, Gemini jami ${fmtUsd(Number(spent.usd))} (${spent.n} chaqiruv)` : ""}`, Date.now() - t1);

  if (ctx.assigned) {
    await setStatus(env.DB, id, "analyzing");
    await env.JOBS.send({ type: "analyze", recordingId: id });
  } else {
    await setStatus(env.DB, id, "awaiting_assignment");
  }
}

// ═══════════════════════════════════════════════════════════════
// 1-bosqich: yuklab olish + STT (sync yoki batch yuborish)
// ═══════════════════════════════════════════════════════════════
async function ingest(env: Env, id: number, force = false, sync = false): Promise<void> {
  const row = await env.DB.prepare(`SELECT * FROM recordings WHERE id = ?`).bind(id).first<any>();
  if (!row) return;
  if (row.status === "done" || row.status === "skipped") return;

  await env.DB.prepare(
    `UPDATE recordings SET attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(id).run();

  let bytes: Uint8Array;
  const t0 = Date.now();
  try {
    await setStatus(env.DB, id, "downloading");
    await logEvent(env.DB, id, "download", "start");

    const maxBytes = (parseInt(env.MAX_INGEST_MB || "90", 10) || 90) * 1024 * 1024;

    // STT bosqichida yiqilgan retry — audio allaqachon R2 da, qayta yuklab olmaymiz.
    let buf: ArrayBuffer | null = null;
    let key: string = row.r2_key || "";
    if (key) {
      const obj = await env.AUDIO.get(key).catch(() => null);
      if (obj) buf = await obj.arrayBuffer();
    }

    if (buf) {
      await logEvent(env.DB, id, "download", "ok",
        `R2 dan olindi, ${Math.round(buf.byteLength / 1024)}KB (qayta yuklanmadi)`, Date.now() - t0);
    } else {
      if (row.size_bytes && row.size_bytes > maxBytes) {
        throw new Error(`Fayl juda katta: ${Math.round(row.size_bytes / 1048576)}MB > ${maxBytes / 1048576}MB`);
      }
      const url = resolveDownloadUrl(row.download_url, env.AUDIOTAP_BASE_URL);
      if (!url) throw new Error("download_url yaroqsiz");

      // Audiotap /download 307 → presigned URL. 2026-10-01 dan bitta uzun ulanish (~85 KB/s, 19 MB ≈ 4 daq)
      // 3–4 daqiqada "Network connection lost" bilan uziladi — bo'laklab (Range) yuklaymiz.
      const dl = await downloadRanged(url);
      buf = dl.buf;
      if (dl.parts > 1) {
        await logEvent(env.DB, id, "download", "info", `${dl.parts} bo'lak (Range), ${dl.retries} qayta urinish`, Date.now() - t0);
      }
      if (buf.byteLength === 0) throw new Error("Bo'sh fayl");
      if (buf.byteLength > maxBytes) throw new Error(`Fayl juda katta: ${Math.round(buf.byteLength / 1048576)}MB`);

      if (row.checksum_sha256) {
        const actual = await sha256Hex(buf);
        if (actual.toLowerCase() !== String(row.checksum_sha256).toLowerCase()) {
          throw new Error("SHA-256 mos kelmadi — fayl buzilgan");
        }
      }

      key = `recordings/${row.recording_id || id}/${row.profile || "default"}.${row.container || "bin"}`;
      await env.AUDIO.put(key, buf, {
        httpMetadata: { contentType: mimeFor(row.container, row.codec) },
        customMetadata: { recordingId: String(id), eventId: String(row.event_id) },
      });
      await logEvent(env.DB, id, "download", "ok", `${Math.round(buf.byteLength / 1024)}KB`, Date.now() - t0);
    }

    bytes = new Uint8Array(buf);
    await env.DB.prepare(
      `UPDATE recordings SET r2_key = ?, size_bytes = ?, status = 'stored',
              error = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(key, buf.byteLength, id).run();
  } catch (e: any) {
    const msg = e?.message || String(e);
    await setStatus(env.DB, id, "failed", msg);
    await logEvent(env.DB, id, "download", "error", msg, Date.now() - t0);
    throw e;
  }

  // ── STT oldidan xarajat nazorati (2026-09-22: 26 ta 80 daqiqalik yozuv, ko'pi bo'sh xona,
  //    avtomatik STT + takroriy o'tishlar bilan ~$24 Gemini balansi ketgan) ──
  const ctx = await loadContext(env, id);
  const sttMode = String(env.STT_MODE || "manual").toLowerCase();

  // 1) Transkript allaqachon bor (queue/cron/ikki marta bosish qayta yuborgan) — STT takrorlanmaydi.
  if (!force) {
    const existing = await env.DB.prepare(
      `SELECT word_count FROM transcripts WHERE recording_id = ?`
    ).bind(id).first<{ word_count: number }>();
    if (existing) {
      await logEvent(env.DB, id, "transcribe", "info",
        `transkript mavjud (${existing.word_count} so'z) — STT takrorlanmadi`);
      if (ctx.assigned) {
        await setStatus(env.DB, id, "analyzing");
        await env.JOBS.send({ type: "analyze", recordingId: id });
      } else {
        await setStatus(env.DB, id, "awaiting_assignment");
      }
      return;
    }
  }

  // 2) manual rejim: audio R2 da saqlanadi, pullik STT faqat admin o'qituvchi/fan/mavzuni
  //    biriktirgach (assignRecording → ingest) yoki "Qayta ishlash → transkripsiya" (force) bilan.
  if (sttMode !== "auto" && !ctx.assigned && !force) {
    await setStatus(env.DB, id, "awaiting_assignment");
    await logEvent(env.DB, id, "transcribe", "info",
      "STT kutmoqda: audio saqlandi; o'qituvchi/fan/mavzu biriktirilgach transkripsiya va baholash boshlanadi (STT_MODE=manual)");
    return;
  }

  // 3) Kunlik limit (audio daqiqa) — bugun STT boshlangan yozuvlar davomiyligi yig'indisi.
  const dailyLimit = parseInt(env.STT_DAILY_LIMIT_MIN || "0", 10) || 0;
  if (dailyLimit > 0 && !force) {
    const used = await env.DB.prepare(
      `SELECT COALESCE(SUM(duration_seconds), 0) / 60.0 AS min FROM recordings
        WHERE id IN (SELECT DISTINCT recording_id FROM processing_events
                      WHERE stage = 'transcribe' AND status = 'start' AND created_at >= date('now')
                        AND recording_id != ?)`
    ).bind(id).first<{ min: number }>();
    const mine = (Number(row.duration_seconds) || 0) / 60;
    if ((used?.min || 0) + mine > dailyLimit) {
      const msg = `Kunlik STT limiti (${dailyLimit} daq) tugadi: bugun ${Math.round(used?.min || 0)} daq ishlatilgan — ertaga biriktiring yoki "Qayta ishlash → transkripsiya" bilan majburan boshlang`;
      await setStatus(env.DB, id, "awaiting_assignment", msg);
      await logEvent(env.DB, id, "transcribe", "warn", msg);
      return;
    }
  }

  // ── STT ──
  const t1 = Date.now();
  try {
    await setStatus(env.DB, id, "transcribing");
    await logEvent(env.DB, id, "transcribe", "start", force ? "majburiy (qayta ishlash)" : (sync ? "sinxron (batch zaxirasi)" : ""));

    const { chunks, chunkSec } = splitForStt(env, bytes);
    if (chunks.length > 1) {
      await logEvent(env.DB, id, "transcribe", "info",
        `${chunks.length} bo'lak × ~${Math.round(chunkSec / 60)} daq (Ogg sahifa bo'linishi)`);
    }

    // force (qayta ishlash) keshni tozalaydi.
    if (force) await env.DB.prepare(`DELETE FROM stt_chunks WHERE recording_id = ?`).bind(id).run();
    const cached = await loadChunkCache(env, id, chunks.length);
    const missing = chunks.filter((ch) => !cached.has(ch.index));
    if (cached.size > 0) {
      await logEvent(env.DB, id, "transcribe", "info",
        `${cached.size}/${chunks.length} bo'lak keshdan — STT takrorlanmadi`);
    }
    if (missing.length === 0) {
      await finalizeTranscript(env, id, chunks.length, ctx, t1);
      return;
    }

    const batchOn = String(env.STT_BATCH || "on").toLowerCase() !== "off";
    if (batchOn && !sync) {
      // Gemini Batch (50% narx): bo'laklar Files API ga → bitta job → cron kuzatadi.
      try {
        await submitBatch(env, id, row, ctx, missing, chunks.length);
        return;
      } catch (e: any) {
        const msg = String(e?.message || e);
        // Balans/limit (402/429) — sinxron ham o'tmaydi, Queue keyinroq qayta uradi.
        if (/\b(402|429)\b|depleted|quota|RESOURCE_EXHAUSTED/i.test(msg)) throw e;
        // Boshqa xato (format, 400/404, tarmoq) — pul yo'qotmasdan sinxron yo'lga o'tamiz.
        await logEvent(env.DB, id, "transcribe", "warn", `Batch yuborilmadi: ${msg.slice(0, 200)} — sinxron STT bilan davom etadi`);
      }
    }

    await transcribeChunksSync(env, id, row, ctx, missing, chunks.length);
    await finalizeTranscript(env, id, chunks.length, ctx, t1);
  } catch (e: any) {
    const msg = e?.message || String(e);
    await setStatus(env.DB, id, "failed", msg);
    await logEvent(env.DB, id, "transcribe", "error", msg, Date.now() - t1);
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════
// Gemini Batch: yuborish, kuzatish, natijani olish
// ═══════════════════════════════════════════════════════════════

/** Bo'laklarni Files API ga yuklab, bitta batch job yaratadi; status = stt_batch. */
async function submitBatch(env: Env, id: number, row: any, ctx: Ctx, missing: OggChunk[], total: number): Promise<void> {
  const mime = mimeFor(row.container, row.codec);
  const model = env.STT_MODEL || "gemini-2.5-flash";
  const instruction = transcriptionInstruction(ctx.subject, ctx.topic);
  const tu = Date.now();

  const items: { key: string; fileUri: string; mimeType: string }[] = [];
  for (const ch of missing) {
    const up = await uploadAudioToGeminiFiles(env.GEMINI_API_KEY, ch.bytes, mime);
    if (!up) throw new Error(`Files API yuklash xatosi (bo'lak ${ch.index + 1}/${total}) — keyinroq qayta uriladi`);
    items.push({ key: String(ch.index), fileUri: up.uri, mimeType: mime });
  }
  await logEvent(env.DB, id, "transcribe", "info",
    `${items.length} bo'lak Files API ga yuklandi`, Date.now() - tu);

  const name = await createSttBatch(env.GEMINI_API_KEY, model, items, instruction, `rec-${id}-${Date.now()}`);
  await env.DB.prepare(
    `UPDATE recordings SET status = 'stt_batch', batch_name = ?, batch_submitted_at = CURRENT_TIMESTAMP,
            error = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(name, id).run();
  await logEvent(env.DB, id, "transcribe", "info",
    `Gemini Batch yuborildi: ${items.length} bo'lak, ${model}, ${name} (narx 50%; odatda 10–60 daq, 24 soatgacha)`);
}

/**
 * Cron (har 10 daqiqada): stt_batch holatidagi yozuvlarning job holatini tekshiradi.
 * Tayyor/yiqilgan → stt_collect job; STT_BATCH_MAX_HOURS dan uzoq kutgan → bekor + sinxron zaxira.
 */
export async function pollSttBatches(env: Env): Promise<{ checked: number; ready: number; fallback: number }> {
  const out = { checked: 0, ready: 0, fallback: 0 };
  const rows = (await env.DB.prepare(
    `SELECT id, batch_name, batch_submitted_at FROM recordings WHERE status = 'stt_batch' LIMIT 30`
  ).all<any>()).results;
  const maxHours = parseFloat(env.STT_BATCH_MAX_HOURS || "36") || 36;

  for (const r of rows) {
    out.checked++;
    const ageH = (Date.now() - Date.parse(String(r.batch_submitted_at || "").replace(" ", "T") + "Z")) / 3600000;
    let state = "";
    try {
      state = (await getSttBatch(env.GEMINI_API_KEY, r.batch_name)).state;
    } catch (e: any) {
      console.error("Batch holati xatosi:", r.id, e?.message || e);
      continue;
    }
    const finished = /SUCCEEDED|FAILED|CANCELLED|EXPIRED/.test(state);
    if (finished) {
      out.ready++;
      await env.DB.prepare(`UPDATE recordings SET status = 'transcribing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(r.id).run();
      await env.JOBS.send({ type: "stt_collect", recordingId: r.id });
    } else if (Number.isFinite(ageH) && ageH > maxHours) {
      out.fallback++;
      await cancelSttBatch(env.GEMINI_API_KEY, r.batch_name).catch(() => {});
      await logEvent(env.DB, r.id, "transcribe", "warn",
        `Batch ${Math.round(ageH)} soatdan beri ${state} — bekor qilindi, sinxron STT bilan davom etadi`);
      await env.DB.prepare(`UPDATE recordings SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(r.id).run();
      await env.JOBS.send({ type: "ingest", recordingId: r.id, sync: true });
    }
  }
  return out;
}

/** Batch natijasini olish: yaxshi bo'laklar → polish + kesh; bo'sh/sikl → sinxron qayta; so'ng finalize. */
async function collectBatch(env: Env, id: number): Promise<void> {
  const t1 = Date.now();
  const row = await env.DB.prepare(`SELECT * FROM recordings WHERE id = ?`).bind(id).first<any>();
  if (!row || !row.batch_name) return;
  if (row.status === "done" || row.status === "skipped") return;

  try {
    await setStatus(env.DB, id, "transcribing");
    const ctx = await loadContext(env, id);
    const bytes = await loadAudio(env, row);
    const { chunks } = splitForStt(env, bytes);
    const total = chunks.length;
    const cached = await loadChunkCache(env, id, total);

    const batch = await getSttBatch(env.GEMINI_API_KEY, row.batch_name);
    if (!/SUCCEEDED/.test(batch.state)) {
      // FAILED / CANCELLED / EXPIRED (yoki hali tayyor emas) — sinxron zaxira, kesh saqlanadi.
      await logEvent(env.DB, id, "transcribe", "warn",
        `Batch ${batch.state}${batch.error ? ": " + batch.error : ""} — sinxron STT bilan davom etadi`);
      await env.DB.prepare(`UPDATE recordings SET batch_name = '' WHERE id = ?`).bind(id).run();
      await env.JOBS.send({ type: "ingest", recordingId: id, sync: true });
      return;
    }

    // Xarajat qoidasi (2026-09-23): batch'da siklga tushgan bo'lakni sinxron qayta ishlash to'liq
    // narx (batch'dan 2 barobar) — kecha 11 yozuvda qaytalar batch'ning o'zidan qimmat tushdi.
    //   - sikl/bo'sh, lekin tozalangan matnda < 40 haqiqiy so'z → bo'sh xona/shovqin: qayta URILMAYDI
    //   - RECITATION (filtr) yoki sikl + ≥ 40 so'z → bitta yengil qayta (t=0.3, yarmsiz)
    //   - yozuv bo'yicha ko'pi bilan MAX_RETRY bo'lak qayta; qolganlari tozalangan matn bilan qoladi
    const MAX_RETRY = 4;
    const retry: OggChunk[] = [];
    let okCount = 0, emptyCount = 0, keptLooped = 0;
    const usedModel = (batch.model || env.STT_MODEL || "gemini-2.5-flash") + " [batch]";
    for (const ch of chunks) {
      if (cached.has(ch.index)) continue;
      const r = batch.results.get(String(ch.index));
      const tc = Date.now();
      const label = `bo'lak ${ch.index + 1}/${total} (${fmtRange(ch)})`;
      // Batch chaqiruvi pullik — natija sikl/bo'sh bo'lsa ham yoziladi.
      if (r?.usage) await recordUsage(env, id, "stt", [r.usage]);
      if (!r || r.error) {
        // Natija yo'q / xato — bitta yengil qayta (limit ichida)
        if (retry.length < MAX_RETRY) retry.push(ch);
        await logEvent(env.DB, id, "transcribe", "warn",
          `${label}: batch ${r?.error || "natija yo'q"} — ${retry.includes(ch) ? "yengil qayta" : "limit, bo'sh qoldi"}`);
        if (!retry.includes(ch)) await saveChunk(env, id, total, ch, "", usedModel, " [batch xato]");
        continue;
      }
      const clean = r.text ? cleanTranscriptChunk(r.text) : "";
      const cleanWords = realWords(clean);
      const looped = r.reason === "MAX_TOKENS" || (r.rawWords > 0 && clean.split(/\s+/).filter(Boolean).length < r.rawWords * 0.5);
      const recitation = !r.text && r.reason === "RECITATION";

      if (!r.text && !recitation) {
        // Model hech narsa qaytarmadi (STOP/OTHER) — nutq yo'q deb hisoblaymiz, pul sarflamaymiz.
        emptyCount++;
        await saveChunk(env, id, total, ch, "", usedModel, " [batch bo'sh]");
        await logEvent(env.DB, id, "transcribe", "warn", `${label}: batch bo'sh (${r.reason || "?"}) — nutq yo'q, qayta urilmadi`);
        continue;
      }
      if ((looped || recitation) && cleanWords < 40) {
        if (recitation && retry.length < MAX_RETRY) {
          retry.push(ch);
          await logEvent(env.DB, id, "transcribe", "warn", `${label}: batch RECITATION — yengil qayta`);
          continue;
        }
        // Sikl + deyarli so'z yo'q = bo'sh xona/shovqin (model chiqindi takrorlaydi). Qayta urilmaydi.
        emptyCount++;
        await saveChunk(env, id, total, ch, "", usedModel, " [batch sikl, bo'sh]");
        await logEvent(env.DB, id, "transcribe", "warn",
          `${label}: batch sikl (${r.rawWords} → ${cleanWords} so'z, ${r.reason}) — nutq deyarli yo'q, qayta urilmadi`);
        continue;
      }
      if (looped) {
        // Bo'lak deyarli to'liq (kutilgan hajmning ≥60%: ~110 so'z/daqiqa) — bu sikl emas, uzun nutq
        // yoki oxirida kichik takror. Qayta urinish shu natijani qimmatga takrorlaydi (09-23: 4 ta
        // 500–1300 so'zli bo'lak qayta ishlanib har biriga $0.04 ketdi). Qabul qilamiz.
        const expectedWords = Math.max(200, Math.round(((ch.endSec - ch.startSec) / 60) * 110));
        if (cleanWords >= expectedWords * 0.6) {
          okCount++;
          await storeChunkResult(env, id, total, ctx, ch, clean, usedModel, " [sikl, qabul]", tc);
          continue;
        }
        if (retry.length < MAX_RETRY) {
          retry.push(ch);
          await logEvent(env.DB, id, "transcribe", "warn",
            `${label}: batch sikl (${r.rawWords} → ${cleanWords} so'z, ${r.reason}) — yengil qayta (t=0.3)`);
          continue;
        }
        // Limit: tozalangan matnni qoldiramiz (sikl boshigacha bo'lgan qism).
        keptLooped++;
        await storeChunkResult(env, id, total, ctx, ch, clean, usedModel, " [sikl, limit]", tc);
        continue;
      }
      okCount++;
      await storeChunkResult(env, id, total, ctx, ch, clean, usedModel, "", tc);
    }
    await logEvent(env.DB, id, "transcribe", "info",
      `Batch natijasi: ${okCount} bo'lak tayyor, ${retry.length} yengil qayta, ${emptyCount} bo'sh (qayta urilmadi), ${keptLooped} sikl-limit, ${cached.size} keshdan`, Date.now() - t1);

    if (retry.length > 0) await transcribeChunksSync(env, id, row, ctx, retry, total, "light");
    await env.DB.prepare(`UPDATE recordings SET batch_name = '' WHERE id = ?`).bind(id).run();
    await finalizeTranscript(env, id, total, ctx, t1);
  } catch (e: any) {
    const msg = e?.message || String(e);
    await setStatus(env.DB, id, "failed", msg);
    await logEvent(env.DB, id, "transcribe", "error", msg, Date.now() - t1);
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════
// 2-bosqich: dars yaratish + AI baholash (5 mezon)
// ═══════════════════════════════════════════════════════════════
async function analyze(env: Env, id: number): Promise<void> {
  const t0 = Date.now();
  try {
    await setStatus(env.DB, id, "analyzing");
    await logEvent(env.DB, id, "analyze", "start");

    const tr = await env.DB.prepare(
      `SELECT text FROM transcripts WHERE recording_id = ?`
    ).bind(id).first<{ text: string }>();
    if (!tr?.text) throw new Error("Transkript topilmadi");

    const row = await env.DB.prepare(
      `SELECT r.*, sub.name AS subject_name FROM recordings r
         LEFT JOIN subjects sub ON sub.id = r.subject_id WHERE r.id = ?`
    ).bind(id).first<any>();
    if (!row) throw new Error("Yozuv topilmadi");
    if (!row.teacher_id || !row.subject_id || !row.topic) {
      throw new Error("O'qituvchi, fan yoki mavzu biriktirilmagan");
    }

    const durationSec = Math.round(Number(row.duration_seconds) || 0);
    const startedAt = row.started_at ? String(row.started_at).replace("T", " ").replace(/\.\d+Z?$/, "").replace("Z", "") : null;

    // Dars yozuvi — bo'lmasa yaratamiz, bo'lsa yangilaymiz (qayta baholash).
    let lessonId: number | null = row.lesson_id || null;
    if (!lessonId) {
      const ins = await env.DB.prepare(
        `INSERT INTO lessons (user_id, group_name, topic, course_type, duration_seconds, transcript, created_at)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`
      ).bind(row.teacher_id, row.group_name || "", row.topic, row.subject_name || "", durationSec, tr.text, startedAt).run();
      lessonId = Number(ins.meta.last_row_id);
      await env.DB.prepare(`UPDATE recordings SET lesson_id = ? WHERE id = ?`).bind(lessonId, id).run();
    } else {
      await env.DB.prepare(
        `UPDATE lessons SET user_id = ?, group_name = ?, topic = ?, course_type = ?, duration_seconds = ?, transcript = ? WHERE id = ?`
      ).bind(row.teacher_id, row.group_name || "", row.topic, row.subject_name || "", durationSec, tr.text, lessonId).run();
    }

    const evAcc: GeminiUsage[] = [];
    const durMin = Math.max(1, Math.round(durationSec / 60));
    let ev = await evaluateLesson(
      env.GEMINI_API_KEY, tr.text, row.subject_name || "", row.topic, durMin, (u) => evAcc.push(u),
    );

    // Ikkinchi signal (2026-09-29, #73): butun darsni ko'rgan baholash modeli "video" bosqichlarini
    // to'g'ri topadi, STT/manba tekshiruvi esa uzun o'zbekcha dublyajni O'QITUVCHI deb qoldirishi
    // mumkin. Video bosqichlari statistikadagi VIDEO dan 5+ daqiqa ko'p bo'lsa — o'sha oraliqlar
    // VIDEO qilinadi, statistika qayta hisoblanadi va dars bir marta qayta baholanadi (~$0.003).
    const vPhases = (ev.timeline?.phases || []).filter((ph) => /video|media|rolik/i.test(ph.type));
    const phaseVideoSec = vPhases.reduce((a, ph) => a + (ph.to - ph.from) * 60, 0);
    const statMediaSec = ev.timeline?.stats?.media_sec || 0;
    if (hasMarkers(tr.text) && vPhases.length && phaseVideoSec - statMediaSec >= 300) {
      const segs = parseLabeled(tr.text);
      const rl = relabelByTime(segs, vPhases.map((ph) => ({ from: ph.from * 60, to: ph.to * 60, who: "media" as const })));
      if (rl.changed > 0) {
        const newStats = computeStats(rl.text, durationSec);
        await env.DB.prepare(`UPDATE transcripts SET text = ?, stats = ? WHERE recording_id = ?`)
          .bind(rl.text, newStats ? JSON.stringify(newStats) : "", id).run();
        await env.DB.prepare(`UPDATE lessons SET transcript = ? WHERE id = ?`).bind(rl.text, lessonId).run();
        await logEvent(env.DB, id, "analyze", "info",
          `video bosqichlari bo'yicha ${rl.changed} parcha VIDEO qilindi (${vPhases.map((ph) => fmtClock(ph.from * 60) + "–" + fmtClock(ph.to * 60)).join(", ")}); video ${Math.round(statMediaSec / 60)} → ${Math.round((newStats?.media_sec || 0) / 60)} daq, qayta baholash`);
        ev = await evaluateLesson(
          env.GEMINI_API_KEY, rl.text, row.subject_name || "", row.topic, durMin, (u) => evAcc.push(u),
        );
      }
    }
    const evUsd = await recordUsage(env, id, "eval", evAcc);
    if (!ev.summary && ev.overall_score === 0) {
      throw new Error("AI baholash bo'sh javob qaytardi (Gemini xatosi?)");
    }

    await env.DB.prepare(
      `INSERT INTO evaluations (
         lesson_id, overall_score, topic_score, speech_score, method_score,
         interaction_score, feedback_score, summary, strengths, improvements, advice, model, timeline
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(lesson_id) DO UPDATE SET
         overall_score = excluded.overall_score, topic_score = excluded.topic_score,
         speech_score = excluded.speech_score, method_score = excluded.method_score,
         interaction_score = excluded.interaction_score, feedback_score = excluded.feedback_score,
         summary = excluded.summary, strengths = excluded.strengths,
         improvements = excluded.improvements, advice = excluded.advice,
         model = excluded.model, timeline = excluded.timeline, created_at = CURRENT_TIMESTAMP`
    ).bind(
      lessonId, ev.overall_score, ev.topic_score, ev.speech_score, ev.method_score,
      ev.interaction_score, ev.feedback_score, ev.summary,
      JSON.stringify(ev.strengths), JSON.stringify(ev.improvements),
      JSON.stringify(ev.advice), ev.model || env.GEMINI_MODEL || "",
      ev.timeline ? JSON.stringify(ev.timeline) : "",
    ).run();

    await setStatus(env.DB, id, "done");
    await logEvent(env.DB, id, "analyze", "ok", `ball=${ev.overall_score}, dars #${lessonId}, ${ev.model || ""}, ${fmtUsd(evUsd)}`, Date.now() - t0);
  } catch (e: any) {
    const msg = e?.message || String(e);
    await setStatus(env.DB, id, "failed", msg);
    await logEvent(env.DB, id, "analyze", "error", msg, Date.now() - t0);
    throw e;
  }
}
