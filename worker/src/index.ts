/**
 * tatuziyo API — Cloudflare Worker.
 *
 *   POST /api/webhooks/audiotap        — audiotap webhook (HMAC, auth yo'q)
 *   POST /api/auth/bootstrap           — birinchi admin (faqat users bo'sh bo'lsa)
 *   POST /api/auth/login               — admin JWT
 *   POST /api/auth/refresh
 *   GET  /api/me
 *   POST /api/me/password              — o'z parolini o'zgartirish
 *   GET  /api/system                   — sozlamalar sahifasi uchun tizim holati
 *   GET  /api/dashboard/stats|live
 *   GET  /api/recordings               — filtrli ro'yxat (server pagination)
 *   GET  /api/recordings/:id
 *   GET  /api/recordings/:id/audio     — R2 stream (Range)
 *   POST /api/recordings/:id/assign    — QO'LDA o'qituvchi/fan/mavzu biriktirish
 *   POST /api/recordings/:id/reprocess?from=download|transcribe|analyze
 *   DELETE /api/recordings/:id
 *   GET/POST /api/teachers, GET/PATCH/DELETE /api/teachers/:id
 *   GET/POST /api/subjects, PATCH/DELETE /api/subjects/:id
 *   GET /api/sources, PATCH /api/sources/:id
 *   GET  /api/health
 */
import { Env, Job, json, err, CORS } from "./types";
import { signJWT, verifyJWT, verifyPassword, hashPassword, REFRESH_EXPIRY_SECONDS } from "./auth";
import { checkRateLimit, clientKey } from "./rateLimit";
import { handleWebhook } from "./webhook";
import { runJob } from "./pipeline";
import * as rec from "./recordings";
import * as dash from "./dashboard";
import * as dir from "./directory";

interface AuthUser { id: number; email: string; role: string; name: string }

async function requireAuth(request: Request, env: Env): Promise<AuthUser | null> {
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  const p = await verifyJWT(h.slice(7), env.JWT_SECRET);
  if (!p || p.typ === "refresh") return null;
  const u = await env.DB.prepare(
    `SELECT id, email, role, name FROM users WHERE id = ? AND active = 1`
  ).bind(p.sub).first<AuthUser>();
  return u || null;
}

/** Sozlamalar sahifasi: konfiguratsiya (secret qiymatlarsiz) + konveyer holati. */
async function systemInfo(request: Request, env: Env): Promise<Response> {
  const u0 = new URL(request.url);
  // Prod har doim https (custom domain); faqat lokal dev http.
  const origin = /localhost|127[.]0[.]0[.]1/.test(u0.hostname) ? u0.origin : "https://" + u0.host;
  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM recordings GROUP BY status`
  ).all();
  const last = await env.DB.prepare(
    `SELECT created_at FROM recordings ORDER BY id DESC LIMIT 1`
  ).first<{ created_at: string }>();
  const users = await env.DB.prepare(
    `SELECT id, email, name, role, active, created_at FROM users ORDER BY id`
  ).all();
  const base = env.AUDIOTAP_BASE_URL || "";
  return json({
    time: new Date().toISOString(),
    webhook_url: `${origin}/api/webhooks/audiotap`,
    vars: {
      gemini_model: env.GEMINI_MODEL || "",
      target_profile: env.TARGET_PROFILE || "speech",
      audiotap_base_url: base,
      max_ingest_mb: env.MAX_INGEST_MB || "90",
    },
    audiotap_base_is_local: /localhost|127\.0\.0\.1|^https?:\/\/(10\.|192\.168\.)/.test(base),
    secrets: {
      gemini_key: Boolean(env.GEMINI_API_KEY),
      jwt: Boolean(env.JWT_SECRET),
      webhook: Boolean(env.AUDIOTAP_WEBHOOK_SECRET),
    },
    last_webhook_at: last?.created_at || null,
    counts: Object.fromEntries((counts.results as any[]).map((r) => [r.status, r.n])),
    users: users.results,
  });
}

async function changePassword(request: Request, env: Env, userId: number): Promise<Response> {
  const b: any = await request.json().catch(() => ({}));
  const current = String(b.current_password || "");
  const next = String(b.new_password || "");
  if (next.length < 8) return err("Yangi parol kamida 8 belgi bo'lsin", 400);
  const u = await env.DB.prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .bind(userId).first<{ password_hash: string }>();
  if (!u) return err("Foydalanuvchi topilmadi", 404);
  const v = await verifyPassword(current, u.password_hash);
  if (!v.valid) return err("Joriy parol noto'g'ri", 400);
  const hash = await hashPassword(next);
  await env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(hash, userId).run();
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    try {
      // ── Webhook (JWT emas, HMAC bilan himoyalangan) ──
      if (path === "/api/webhooks/audiotap" && method === "POST") {
        return handleWebhook(request, env);
      }

      if (path === "/api/health") {
        const last = await env.DB.prepare(
          `SELECT created_at FROM recordings ORDER BY id DESC LIMIT 1`
        ).first<any>();
        return json({
          ok: true,
          time: new Date().toISOString(),
          last_webhook_at: last?.created_at || null,
          webhook_secret_set: Boolean(env.AUDIOTAP_WEBHOOK_SECRET),
          gemini_key_set: Boolean(env.GEMINI_API_KEY),
        });
      }

      // ── Birinchi admin — faqat users jadvali bo'sh bo'lsa ishlaydi ──
      if (path === "/api/auth/bootstrap" && method === "POST") {
        const rl = await checkRateLimit(env.DB, clientKey(request, "bootstrap"), 5, 600);
        if (!rl.allowed) return err("Juda ko'p urinish", 429);

        const existing = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>();
        if ((existing?.n ?? 0) > 0) return err("Allaqachon sozlangan", 409);

        const b: any = await request.json().catch(() => ({}));
        const email = String(b.email || "").trim().toLowerCase();
        const password = String(b.password || "");
        const name = String(b.name || "").trim();
        if (!email.includes("@")) return err("Email noto'g'ri", 400);
        if (password.length < 8) return err("Parol kamida 8 belgi bo'lsin", 400);

        const hash = await hashPassword(password);
        await env.DB.prepare(
          `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')`
        ).bind(email, hash, name).run();
        return json({ ok: true, email }, 201);
      }

      // ── Auth ──
      if (path === "/api/auth/login" && method === "POST") {
        const rl = await checkRateLimit(env.DB, clientKey(request, "login"), 10, 60);
        if (!rl.allowed) return err("Juda ko'p urinish. Keyinroq qayta urinib ko'ring.", 429);

        const b: any = await request.json().catch(() => ({}));
        const email = String(b.email || "").trim().toLowerCase();
        const password = String(b.password || "");
        if (!email || !password) return err("Email va parol kerak", 400);

        const u = await env.DB.prepare(
          `SELECT id, email, name, role, password_hash FROM users WHERE email = ? AND active = 1`
        ).bind(email).first<any>();
        // Foydalanuvchi yo'qligini oshkor qilmaymiz.
        if (!u) return err("Email yoki parol noto'g'ri", 401);

        const v = await verifyPassword(password, u.password_hash);
        if (!v.valid) return err("Email yoki parol noto'g'ri", 401);
        if (v.needsRehash) {
          const fresh = await hashPassword(password);
          await env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
            .bind(fresh, u.id).run();
        }

        const access  = await signJWT({ sub: u.id, role: u.role }, env.JWT_SECRET);
        const refresh = await signJWT({ sub: u.id, typ: "refresh" }, env.JWT_SECRET, REFRESH_EXPIRY_SECONDS);
        return json({
          access_token: access, refresh_token: refresh,
          token_type: "bearer", expires_in: 3600,
          user: { id: u.id, email: u.email, name: u.name, role: u.role },
        });
      }

      if (path === "/api/auth/refresh" && method === "POST") {
        const b: any = await request.json().catch(() => ({}));
        const p = await verifyJWT(String(b.refresh_token || ""), env.JWT_SECRET);
        if (!p || p.typ !== "refresh") return err("Refresh token yaroqsiz", 401);
        const u = await env.DB.prepare(
          `SELECT id, role FROM users WHERE id = ? AND active = 1`
        ).bind(p.sub).first<any>();
        if (!u) return err("Foydalanuvchi topilmadi", 401);
        const access = await signJWT({ sub: u.id, role: u.role }, env.JWT_SECRET);
        return json({ access_token: access, refresh_token: b.refresh_token,
                      token_type: "bearer", expires_in: 3600 });
      }

      // ── Bundan keyingi hamma narsa autentifikatsiya talab qiladi ──
      const user = await requireAuth(request, env);
      if (!user) return err("Avtorizatsiya talab qilinadi", 401);
      const isAdmin = user.role === "admin";

      if (path === "/api/me" && method === "GET") return json({ user });
      if (path === "/api/me/password" && method === "POST") return changePassword(request, env, user.id);
      if (path === "/api/system" && method === "GET") return systemInfo(request, env);

      // ── Dashboard ──
      if (path === "/api/dashboard/stats" && method === "GET") return dash.stats(request, env);
      if (path === "/api/dashboard/live"  && method === "GET") return dash.live(env);

      // ── Recordings ──
      if (path === "/api/recordings" && method === "GET") return rec.listRecordings(request, env);

      const m = path.match(/^\/api\/recordings\/(\d+)(\/[a-z]+)?$/);
      if (m) {
        const id = parseInt(m[1], 10);
        const sub = m[2] || "";
        if (sub === ""           && method === "GET")  return rec.getRecording(env, id);
        if (sub === "/audio"     && method === "GET")  return rec.streamAudio(request, env, id);
        if (sub === "/assign"    && method === "POST") return rec.assignRecording(request, env, id, user.id);
        if (sub === "/reprocess" && method === "POST") return rec.reprocess(request, env, id);
        if (sub === ""           && method === "DELETE") {
          if (!isAdmin) return err("Ruxsat yo'q", 403);
          return rec.deleteRecording(env, id);
        }
      }

      // ── Ma'lumotnoma ──
      if (path === "/api/teachers" && method === "GET")  return dir.listTeachers(env);
      if (path === "/api/teachers" && method === "POST") return dir.createTeacher(request, env);
      const mt = path.match(/^\/api\/teachers\/(\d+)$/);
      if (mt) {
        const tid = parseInt(mt[1], 10);
        if (method === "GET")    return dir.getTeacher(env, tid);
        if (method === "PATCH")  return dir.updateTeacher(request, env, tid);
        if (method === "DELETE") {
          if (!isAdmin) return err("Ruxsat yo'q", 403);
          return dir.deleteTeacher(env, tid);
        }
      }

      if (path === "/api/subjects" && method === "GET")  return dir.listSubjects(env);
      if (path === "/api/subjects" && method === "POST") return dir.createSubject(request, env);
      const msub = path.match(/^\/api\/subjects\/(\d+)$/);
      if (msub) {
        const sid = parseInt(msub[1], 10);
        if (method === "PATCH")  return dir.updateSubject(request, env, sid);
        if (method === "DELETE") {
          if (!isAdmin) return err("Ruxsat yo'q", 403);
          return dir.deleteSubject(env, sid);
        }
      }

      if (path === "/api/sources" && method === "GET")   return dir.listSources(env);
      const ms = path.match(/^\/api\/sources\/(\d+)$/);
      if (ms && method === "PATCH") return dir.updateSource(request, env, parseInt(ms[1], 10));

      return err("Topilmadi", 404);
    } catch (e: any) {
      const msg = String(e?.message || e);
      // D1 bepul tarif kunlik limiti (hisob bo'yicha umumiy) — foydalanuvchiga aniq aytamiz.
      if (/row read limit|daily.*limit|code: 7500/i.test(msg)) {
        console.error("D1 kunlik limit:", msg);
        return err("Ma'lumotlar bazasi kunlik limiti tugadi (Cloudflare D1 bepul tarif). Yarim tunda (00:00 UTC, 05:00 Toshkent) tiklanadi yoki Workers Paid tarifga o'ting.", 503);
      }
      console.error("Worker xatosi:", e?.stack || e);
      return err("Serverda xatolik", 500);
    }
  },

  /** Queue consumer — bitta xabar = bitta yozuv. */
  async queue(batch: MessageBatch<Job>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await runJob(msg.body, env);
        msg.ack();
      } catch (e: any) {
        console.error("Job xatosi:", msg.body, e?.message || e);
        // 60s, 120s, 240s — audiotap/Gemini vaqtincha ishlamasa kutamiz.
        msg.retry({ delaySeconds: 60 * Math.pow(2, msg.attempts - 1) });
      }
    }
  },

  /** Cron — osilib qolgan ishlarni tiklaydi (har 10 daqiqada). */
  async scheduled(_evt: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      // 30 daqiqadan beri oraliq holatda qolgan va urinishlari tugamaganlar.
      const stuck = await env.DB.prepare(
        `SELECT id, status FROM recordings
          WHERE status IN ('queued','downloading','stored','transcribing','analyzing')
            AND updated_at < datetime('now','-30 minutes')
            AND attempts < 5
          LIMIT 20`
      ).all<{ id: number; status: string }>();

      for (const r of stuck.results) {
        const job: Job = r.status === "analyzing"
          ? { type: "analyze", recordingId: r.id }
          : { type: "ingest", recordingId: r.id };
        // updated_at yangilanadi — keyingi cron shu yozuvni yana 30 daqiqa tegmaydi.
        await env.DB.prepare(
          `UPDATE recordings SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(r.id).run();
        await env.JOBS.send(job);
        console.log(`Cron: #${r.id} (${r.status}) qayta navbatga qo'yildi → ${job.type}`);
      }

      // 5 martadan ko'p urinilganlarni failed deb belgilaymiz.
      await env.DB.prepare(
        `UPDATE recordings SET status='failed',
                error = COALESCE(NULLIF(error,''), 'Maksimal urinish soniga yetdi')
          WHERE status IN ('queued','downloading','stored','transcribing','analyzing')
            AND attempts >= 5 AND updated_at < datetime('now','-30 minutes')`
      ).run();
    })());
  },
};
