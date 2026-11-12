#!/usr/bin/env node
/**
 * Audiotap webhook debug receiver — mikrofon tekshiruvi uchun.
 *
 * Nima qiladi:
 *   1. LAN'da (0.0.0.0) HTTP server ko'taradi va audiotap webhook'ini qabul qiladi.
 *   2. `recording.available` kelganda artifact'ni yuklab oladi (download_url'dagi
 *      "localhost" hostini --host bilan almashtiradi).
 *   3. Faylni ./audiotap-out ga saqlaydi, SHA-256 ni payload bilan solishtiradi.
 *   4. ffmpeg bor bo'lsa ovoz darajasini (mean/max dB) o'lchaydi — mikrofon
 *      haqiqatan tovush yozganini shu ko'rsatadi.
 *   5. --transcribe bilan: audioni Eyeziyo API'ning /api/admin/gemini-test
 *      endpointiga yuboradi → transkript + 5 mezon bo'yicha AI baho chiqaradi.
 *      (Bu endpoint bazaga hech narsa yozmaydi — faqat tekshiruv.)
 *
 * Ishlatish:
 *   node tools/audiotap-debug.mjs --host http://192.168.100.50/api
 *   node tools/audiotap-debug.mjs --host http://192.168.100.50/api --transcribe --login admin@eyeziyo.uz:PAROL
 *
 * Parametrlar:
 *   --host <url>     Audiotap serverning LAN manzili (masalan http://192.168.100.50/api).
 *                    Berilmasa payload'dagi download_url o'zgarishsiz ishlatiladi.
 *   --port <n>       Tinglash porti (default 8787).
 *   --out <dir>      Saqlash papkasi (default ./audiotap-out).
 *   --transcribe     Yuklab olingandan keyin STT + baholashni ishga tushirish.
 *   --login <e:p>    Admin email:parol (token olish uchun).
 *   --token <jwt>    Tayyor access token (EYEZIYO_TOKEN env ham bo'ladi).
 *   --api <url>      Eyeziyo API bazasi (default https://eyeziyo-api.eyeziyo.workers.dev).
 *   --topic <text>   Dars mavzusi (STT va baholash aniqligini oshiradi).
 *   --course <text>  Fan nomi / kurs turi.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// ── CLI ──
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const PORT = parseInt(arg("port", "8787"), 10);
const HOST_BASE = arg("host");
const OUT_DIR = path.resolve(arg("out", "audiotap-out"));

const DO_STT = process.argv.includes("--transcribe");
const API_BASE = arg("api", "https://eyeziyo-api.eyeziyo.workers.dev").replace(/\/$/, "");
const LOGIN = arg("login");
const TOPIC = arg("topic", "");
const COURSE = arg("course", "");
let TOKEN = arg("token", process.env.EYEZIYO_TOKEN || null);

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Log helpers ──
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", b: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", cyan: "\x1b[36m",
};
const ts = () => new Date().toLocaleTimeString("uz-UZ", { hour12: false });
const log = (...a) => console.log(`${C.dim}[${ts()}]${C.reset}`, ...a);
const ok = (...a) => log(`${C.green}✓${C.reset}`, ...a);
const bad = (...a) => log(`${C.red}✗${C.reset}`, ...a);
const info = (...a) => log(`${C.cyan}·${C.reset}`, ...a);
const warn = (...a) => log(`${C.yellow}!${C.reset}`, ...a);

// ── LAN IP ──
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === "IPv4" && !n.internal) out.push(n.address);
    }
  }
  return out;
}

// ── download_url origin rewrite ──
// Payload "http://localhost/api/recordings/..." beradi — localhost bu yerda
// audiotap serverning o'zi, biz uchun u LAN manzil.
function resolveUrl(rawUrl) {
  if (!rawUrl) return null;
  if (!HOST_BASE) return rawUrl;
  try {
    const u = new URL(rawUrl);
    const base = new URL(HOST_BASE);
    const basePath = base.pathname.replace(/\/$/, "");
    let p = u.pathname;
    if (basePath.endsWith("/api") && p.startsWith("/api/")) p = p.slice(4);
    return `${base.origin}${basePath}${p}${u.search}`;
  } catch {
    return rawUrl;
  }
}

const fmtBytes = (n) => n > 1e6 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;

// ── Eyeziyo API: admin token ──
async function ensureToken() {
  if (TOKEN) return TOKEN;
  if (!LOGIN) return null;
  const sep = LOGIN.indexOf(":");
  if (sep === -1) { bad("--login formati: email:parol"); return null; }
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: LOGIN.slice(0, sep), password: LOGIN.slice(sep + 1) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      bad(`Login xatosi: HTTP ${res.status} ${body.detail || ""}`);
      return null;
    }
    TOKEN = body.access_token;
    ok(`Eyeziyo API'ga kirildi (${LOGIN.slice(0, sep)})`);
    return TOKEN;
  } catch (e) {
    bad(`Login ulanish xatosi: ${e.message}`);
    return null;
  }
}

const MIME_BY_CONTAINER = {
  ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
  wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac",
};

// ── STT + baholash ──
// Mavjud /api/admin/gemini-test endpointi: audio → transkript → 5 mezon baho.
// Bazaga yozmaydi, shuning uchun debug uchun xavfsiz.
async function transcribeAndEvaluate(file, art) {
  const token = await ensureToken();
  if (!token) {
    warn("Token yo'q — STT o'tkazib yuborildi (--login yoki --token bering)");
    return;
  }

  const durationMinutes = Math.max(1, Math.round((art.duration_seconds || 60) / 60));
  const mime = MIME_BY_CONTAINER[art.container] || "application/octet-stream";

  console.log("");
  info(`${C.b}STT + baholash${C.reset} ${C.dim}(${mime}, ~${durationMinutes} min)${C.reset}`);

  const form = new FormData();
  form.append("audio", new Blob([fs.readFileSync(file)], { type: mime }), path.basename(file));
  form.append("course_type", COURSE);
  form.append("topic", TOPIC);
  form.append("duration_minutes", String(durationMinutes));

  const t0 = Date.now();
  let res, body;
  try {
    res = await fetch(`${API_BASE}/api/admin/gemini-test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    body = await res.json().catch(() => ({}));
  } catch (e) {
    bad(`STT ulanish xatosi: ${e.message}`);
    return;
  }
  if (!res.ok) {
    bad(`STT xatosi: HTTP ${res.status} ${body?.detail || ""}`);
    return;
  }

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  if (body.warning) warn(body.warning);
  if (!body.transcript) {
    bad("Transkript bo'sh — audio juda jim yoki nutq yo'q");
    return;
  }

  // Konsolda faqat qisqartma ko'rinadi — to'liq matnni yonma-yon saqlaymiz,
  // aks holda qayta STT qilishga to'g'ri keladi.
  const txtFile = file.replace(/\.[^.]+$/, "") + ".txt";
  const jsonFile = file.replace(/\.[^.]+$/, "") + ".eval.json";
  try {
    fs.writeFileSync(txtFile, body.transcript, "utf8");
    fs.writeFileSync(jsonFile, JSON.stringify(body, null, 2), "utf8");
  } catch (e) {
    warn(`Natijani saqlash xatosi: ${e.message}`);
  }

  ok(`Transkript: ${C.b}${body.transcript_chars}${C.reset} belgi ${C.dim}(model ${body.model} · STT ${(body.stt_ms / 1000).toFixed(1)}s · jami ${total}s)${C.reset}`);
  info(`Saqlandi: ${C.dim}${path.basename(txtFile)} + ${path.basename(jsonFile)}${C.reset}`);
  console.log(`${C.dim}┌─ transkript ${"─".repeat(48)}${C.reset}`);
  const preview = body.transcript.length > 700 ? body.transcript.slice(0, 700) + "…" : body.transcript;
  for (const line of preview.split("\n")) console.log(`${C.dim}│${C.reset} ${line}`);
  console.log(`${C.dim}└${"─".repeat(60)}${C.reset}`);

  const ev = body.evaluation;
  if (!ev) {
    warn("Baho qaytmadi");
    return;
  }

  const CRIT = [
    ["topic_score", "Mavzu mosligi"],
    ["speech_score", "Nutq tozaligi"],
    ["method_score", "Metodika"],
    ["interaction_score", "Interaktivlik"],
    ["feedback_score", "Teskari aloqa"],
  ];
  const overall = ev.overall_score ?? 0;
  const color = overall >= 85 ? C.green : overall >= 50 ? C.yellow : C.red;
  ok(`AI baho: ${color}${C.b}${overall}%${C.reset} ${C.dim}(baholash ${(body.eval_ms / 1000).toFixed(1)}s)${C.reset}`);
  for (const [key, label] of CRIT) {
    const v = ev[key] ?? 0;
    const bar = "█".repeat(Math.round(v / 2)).padEnd(10, "░");
    console.log(`    ${label.padEnd(16)} ${bar} ${String(v).padStart(2)}/20`);
  }
  if (ev.summary) console.log(`\n    ${C.b}Xulosa:${C.reset} ${ev.summary}`);
}

// ── ffmpeg: ovoz darajasi ──
function volumeDetect(file) {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
    let err = "";
    ff.stderr.on("data", (d) => { err += d.toString(); });
    ff.on("error", () => resolve(null));
    ff.on("close", () => {
      const mean = err.match(/mean_volume:\s*(-?[\d.]+) dB/);
      const max = err.match(/max_volume:\s*(-?[\d.]+) dB/);
      if (!mean && !max) return resolve(null);
      resolve({
        mean: mean ? parseFloat(mean[1]) : null,
        max: max ? parseFloat(max[1]) : null,
      });
    });
  });
}

// Mikrofon holatini dB bo'yicha izohlash.
function diagnose(vol) {
  if (!vol || vol.max === null) return null;
  if (vol.max <= -60) return { level: "bad", msg: "JIMLIK — mikrofondan tovush kelmayapti" };
  if (vol.max <= -30) return { level: "warn", msg: "Juda past — mikrofon uzoq yoki gain kichik" };
  if (vol.max >= -1) return { level: "warn", msg: "Clipping xavfi — gain juda baland" };
  if (vol.mean !== null && vol.mean <= -50) return { level: "warn", msg: "Asosan jimlik, faqat qisqa tovushlar bor" };
  return { level: "good", msg: "Mikrofon normal tovush yozgan" };
}

// ── Artifact yuklab olish + tekshirish ──
async function handleArtifact(rec, art, idx) {
  const url = resolveUrl(art.download_url);
  const name = `${(rec.id || "rec").slice(0, 8)}_${art.profile || "audio"}.${art.container || "bin"}`;
  const file = path.join(OUT_DIR, name);

  console.log("");
  info(`${C.b}Artifact ${idx + 1}${C.reset}: ${art.profile_name || art.profile} ${C.dim}(${art.codec}/${art.container}, ${art.channels}ch, ${art.sample_rate} Hz)${C.reset}`);
  info(`Kutilgan hajm: ${fmtBytes(art.size_bytes || 0)} · davomiylik: ${art.duration_seconds}s`);
  info(`Yuklab olish: ${C.dim}${url}${C.reset}`);

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (e) {
    bad(`Ulanish xatosi: ${e.message}`);
    warn("Audiotap serverga yetib bo'lmadi — --host manzilini va WiFi'ni tekshiring");
    return;
  }
  if (!res.ok || !res.body) {
    bad(`HTTP ${res.status} ${res.statusText}`);
    return;
  }

  const hash = crypto.createHash("sha256");
  let bytes = 0;
  const out = fs.createWriteStream(file);
  const src = Readable.fromWeb(res.body);
  src.on("data", (c) => { bytes += c.length; hash.update(c); });
  try {
    await pipeline(src, out);
  } catch (e) {
    bad(`Yozish xatosi: ${e.message}`);
    return;
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  ok(`Yuklandi: ${fmtBytes(bytes)} · ${secs}s · ${C.dim}${file}${C.reset}`);

  // Hajm mosligi
  if (art.size_bytes && bytes !== art.size_bytes) {
    warn(`Hajm mos emas: kutilgan ${art.size_bytes}, olingan ${bytes}`);
  }

  // Checksum — audio buzilmasdan yetib kelganini isbotlaydi
  const digest = hash.digest("hex");
  if (art.checksum_sha256) {
    if (digest === art.checksum_sha256) ok("SHA-256 mos — fayl buzilmagan");
    else bad(`SHA-256 MOS EMAS!\n    kutilgan: ${art.checksum_sha256}\n    olingan:  ${digest}`);
  } else {
    info(`SHA-256: ${digest.slice(0, 16)}…`);
  }

  // Ovoz darajasi — mikrofon tekshiruvining asosiy qismi
  const vol = await volumeDetect(file);
  if (!vol) {
    warn("ffmpeg topilmadi yoki o'qiy olmadi — ovoz darajasi tekshirilmadi");
    return;
  }
  info(`Ovoz darajasi: mean ${vol.mean} dB · max ${vol.max} dB`);
  const d = diagnose(vol);
  if (d?.level === "good") ok(`${C.b}${d.msg}${C.reset}`);
  else if (d?.level === "warn") warn(d.msg);
  else if (d?.level === "bad") bad(`${C.b}${d.msg}${C.reset}`);

  // Jimlikda STT ma'nosiz — Gemini kvotasini behuda sarflamaymiz.
  if (!DO_STT) return;
  if (d?.level === "bad") {
    warn("Jimlik sababli STT o'tkazib yuborildi");
    return;
  }
  await transcribeAndEvaluate(file, art);
}

// ── Webhook qabul qilish ──
async function onEvent(event, headers) {
  const type = event?.type || "?";
  console.log(`\n${C.b}${"═".repeat(64)}${C.reset}`);
  log(`${C.blue}${C.b}WEBHOOK${C.reset} ${C.b}${type}${C.reset}  ${C.dim}id=${(event?.id || "").slice(0, 8)}${C.reset}`);

  if (headers["webhook-signature"]) {
    info(`Imzo bor ${C.dim}(${String(headers["webhook-signature"]).slice(0, 24)}…)${C.reset}`);
  } else {
    info("Imzo yo'q (secret sozlanmagan)");
  }

  if (type !== "recording.available") {
    warn(`E'tiborsiz qoldirildi (faqat recording.available kerak)`);
    return;
  }

  const d = event.data || {};
  const rec = d.recording || {};
  const arts = Array.isArray(d.artifacts) ? d.artifacts : [];

  info(`Manba: ${C.b}${d.audio_source?.name || "?"}${C.reset} (${d.audio_source?.type || "?"}) · jadval: ${d.schedule?.name || "?"}`);
  info(`Yozuv: ${rec.started_at || "?"} → ${rec.finalized_at || "?"}`);

  // To'liqlik — AES67 paketlari yo'qolmaganini ko'rsatadi
  const comp = d.completeness || {};
  if (comp.status === "complete") ok(`To'liqlik: complete · gap yo'q`);
  else {
    bad(`To'liqlik: ${comp.status} · yo'qolgan ${comp.gap_seconds_total}s`);
    for (const g of comp.gaps || []) warn(`  gap: ${JSON.stringify(g)}`);
  }

  if (arts.length === 0) {
    bad("Artifact yo'q — yuklab olishga narsa yo'q");
    return;
  }

  for (let i = 0; i < arts.length; i++) {
    await handleArtifact(rec, arts[i], i);
  }
  console.log(`${C.b}${"═".repeat(64)}${C.reset}`);
}

// ── Server ──
const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, listening: true, out: OUT_DIR }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    // Audiotap 10s timeout bilan kutadi — darhol javob beramiz, yuklab olish fonda.
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      bad(`JSON emas (${raw.length} bayt): ${raw.slice(0, 120)}`);
      return;
    }
    onEvent(event, req.headers).catch((e) => bad(`Ishlov xatosi: ${e.message}`));
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n${C.b}${C.blue}Audiotap debug receiver${C.reset} ${C.dim}— mikrofon tekshiruvi${C.reset}`);
  console.log(`${"─".repeat(64)}`);
  console.log(`Saqlash papkasi : ${C.b}${OUT_DIR}${C.reset}`);
  console.log(`Audiotap manzili: ${HOST_BASE ? C.b + HOST_BASE + C.reset : C.yellow + "berilmagan (payload'dagi URL ishlatiladi)" + C.reset}`);
  console.log(`STT + baholash  : ${DO_STT ? C.green + "yoniq → " + API_BASE + C.reset : C.dim + "o'chiq (--transcribe bilan yonadi)" + C.reset}`);
  console.log(`\n${C.b}Audiotap webhook target'ida shu URL'ni ko'rsating:${C.reset}`);
  for (const ip of lanIPs()) {
    console.log(`  ${C.green}http://${ip}:${PORT}/api/webhooks/audiotap${C.reset}`);
  }
  console.log(`\n${C.dim}Event: recording.available · Secret: bo'sh qoldiring (debug)${C.reset}`);
  console.log(`${C.dim}Kutilmoqda… (Ctrl+C bilan to'xtatish)${C.reset}\n`);
});
