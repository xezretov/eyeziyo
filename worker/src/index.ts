/**
 * tatuziyo API — Cloudflare Worker (tuit.eyeziyo.uz).
 *
 * Admin panel API eyeziyo (admin.eyeziyo.uz) bilan BIR XIL: institution,
 * iyerarxiya, guruhlar, fanlar, o'qituvchilar, o'quvchilar, baholash
 * savollari, darslar, baholar, dashboard. HEMIS, Android jonli sessiya va
 * Mentor (o'quvchi) app endpointlari YO'Q.
 *
 * Qo'shimcha (audiotap konveyeri):
 *   POST /api/webhooks/audiotap                 — audiotap webhook (HMAC)
 *   GET  /api/recordings, /:id, /:id/audio      — yozuvlar
 *   POST /api/recordings/:id/assign|reprocess   — biriktirish / qayta ishlash
 *   GET  /api/sources, PATCH /api/sources/:id   — xonalar (audiotap manbalari)
 *   GET  /api/admin/auditoriums                 — o'sha xonalar admin-web formatida
 *   GET  /api/dashboard/live                    — jonli konveyer
 *   GET  /api/system, POST /api/system/replay-webhooks
 *   POST /api/auth/bootstrap                    — birinchi admin (users bo'sh bo'lsa)
 *   POST /api/me/password
 */
import { signJWT, verifyJWT, verifyPassword, hashPassword, TOKEN_EXPIRY_SECONDS, REFRESH_EXPIRY_SECONDS } from "./auth";
import { evaluateLesson } from "./gemini";
import { checkRateLimit, clientKey } from "./rateLimit";
import { handleAdminStudents, handleAdminStudentDetail } from "./mentor-admin";
import {
  handleGetInstitution, handleCreateInstitution, handleUpdateInstitution,
  handleListHierarchy, handleCreateHierarchy, handleUpdateHierarchy, handleDeleteHierarchy,
  handleListSubjects, handleCreateSubject, handleUpdateSubject, handleDeleteSubject,
  handleListGroups, handleGetGroup, handleCreateGroup, handleUpdateGroup, handleDeleteGroup,
  handleGetTeacherAssignments, handleSetTeacherAssignments,
  handleSetStudentGroups,
} from "./admin-core";
import {
  handleListEvalQuestions, handleCreateEvalQuestion,
  handleUpdateEvalQuestion, handleDeleteEvalQuestion,
  handleEvalQuestionResults,
} from "./admin-eval";
import { Env, Job, CORS, cleanEnv } from "./types";
import { handleWebhook, replayPendingWebhooks, countPendingWebhooks } from "./webhook";
import { runJob, pollSttBatches } from "./pipeline";
import * as rec from "./recordings";
import * as dash from "./dashboard";
import * as dir from "./directory";

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ detail: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." }),
    { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.max(1, retryAfter)), ...CORS } }
  );
}

// ── Auth middleware ──
async function getUser(request: Request, env: Env): Promise<any | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET);
  if (!payload?.sub || payload.type === "refresh") return null;
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND active = 1").bind(payload.sub).first();
  return row || null;
}

async function requireUser(request: Request, env: Env): Promise<[any, null] | [null, Response]> {
  const user = await getUser(request, env);
  if (!user) return [null, json({ detail: "Avtorizatsiya kerak" }, 401)];
  return [user, null];
}

async function requireAdmin(request: Request, env: Env): Promise<[any, null] | [null, Response]> {
  const [user, err] = await requireUser(request, env);
  if (err) return [null, err];
  if (user.role !== "admin") return [null, json({ detail: "Admin huquqi kerak" }, 403)];
  return [user, null];
}

/** O'qituvchi guruhlari: teacher_groups → groups_v2, bo'lmasa users.groups JSON. */
async function getEffectiveGroups(user: any, env: Env): Promise<string[]> {
  if (user.role === "teacher") {
    try {
      const rows = await env.DB.prepare(
        `SELECT g.name FROM groups_v2 g JOIN teacher_groups tg ON tg.group_id = g.id
          WHERE tg.teacher_id = ? ORDER BY g.name`
      ).bind(user.id).all();
      const names = (rows.results || []).map((r: any) => String(r.name || "").trim()).filter(Boolean);
      if (names.length > 0) return names;
    } catch { /* legacy'ga o'tamiz */ }
  }
  try {
    const legacy = JSON.parse((user.groups as string) || "[]");
    return Array.isArray(legacy) ? legacy.map((g: any) => (typeof g === "string" ? g : g?.name || "")).filter(Boolean) : [];
  } catch { return []; }
}

// ── tatuziyo'ga xos handler'lar ──

/** Birinchi admin — faqat users jadvali bo'sh bo'lganda. Muassasa keyin onboarding'da yaratiladi. */
async function handleBootstrap(request: Request, env: Env): Promise<Response> {
  const rl = await checkRateLimit(env.DB, clientKey(request, "bootstrap"), 5, 600);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
  const existing = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return json({ detail: "Allaqachon sozlangan" }, 409);

  const b: any = await request.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const name = String(b.name || "").trim() || "Administrator";
  if (!email.includes("@")) return json({ detail: "Email noto'g'ri" }, 400);
  if (password.length < 8) return json({ detail: "Parol kamida 8 belgi bo'lsin" }, 400);

  const hash = await hashPassword(password);
  await env.DB.prepare(
    `INSERT INTO users (email, password_hash, name, role, avatar) VALUES (?, ?, ?, 'admin', ?)`
  ).bind(email, hash, name, name.charAt(0).toUpperCase()).run();
  return json({ ok: true, email }, 201);
}

async function handleChangePassword(request: Request, env: Env, user: any): Promise<Response> {
  const b: any = await request.json().catch(() => ({}));
  const current = String(b.current_password || "");
  const next = String(b.new_password || "");
  if (next.length < 8) return json({ detail: "Yangi parol kamida 8 belgi bo'lsin" }, 400);
  const v = await verifyPassword(current, user.password_hash);
  if (!v.valid) return json({ detail: "Joriy parol noto'g'ri" }, 400);
  const hash = await hashPassword(next);
  await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(hash, user.id).run();
  return json({ ok: true });
}

/** Sozlamalar sahifasi: audiotap/konveyer holati (secret qiymatlarsiz). */
async function handleSystemInfo(request: Request, env: Env): Promise<Response> {
  const u0 = new URL(request.url);
  const origin = /localhost|127[.]0[.]0[.]1/.test(u0.hostname) ? u0.origin : "https://" + u0.host;
  const counts = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM recordings GROUP BY status`).all();
  const last = await env.DB.prepare(`SELECT created_at FROM recordings ORDER BY id DESC LIMIT 1`).first<{ created_at: string }>();
  const users = await env.DB.prepare(
    `SELECT id, email, name, role, active, created_at FROM users WHERE role = 'admin' ORDER BY id`
  ).all();
  const base = env.AUDIOTAP_BASE_URL || "";
  // Gemini sarfi (usageMetadata bo'yicha hisoblangan, 2026-09-23 dan)
  const usage = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN created_at >= date('now') THEN usd END), 0) AS today,
            COALESCE(SUM(CASE WHEN created_at >= date('now','-7 days') THEN usd END), 0) AS week,
            COALESCE(SUM(usd), 0) AS total,
            SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END) AS today_calls,
            MIN(created_at) AS since
       FROM gemini_usage`
  ).first<any>().catch(() => null);
  return json({
    time: new Date().toISOString(),
    gemini_usage: usage,
    webhook_url: `${origin}/api/webhooks/audiotap`,
    vars: {
      gemini_model: env.GEMINI_MODEL || "",
      target_profile: env.TARGET_PROFILE || "speech",
      audiotap_base_url: base,
      max_ingest_mb: env.MAX_INGEST_MB || "90",
    },
    audiotap_base_is_local: /localhost|127[.]0[.]0[.]1|^https?:\/\/(10[.]|192[.]168[.])/.test(base),
    secrets: {
      gemini_key: Boolean(env.GEMINI_API_KEY),
      jwt: Boolean(env.JWT_SECRET),
      webhook: Boolean(env.AUDIOTAP_WEBHOOK_SECRET),
    },
    last_webhook_at: last?.created_at || null,
    pending_webhooks: await countPendingWebhooks(env).catch(() => -1),
    counts: Object.fromEntries((counts.results as any[]).map((r) => [r.status, r.n])),
    users: users.results,
  });
}

// ── Router ──
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    if (path === "/api/health" || path === "/health") {
      const last = await env.DB.prepare(`SELECT created_at FROM recordings ORDER BY id DESC LIMIT 1`).first<any>();
      return json({
        ok: true, status: "healthy", time: new Date().toISOString(),
        last_webhook_at: last?.created_at || null,
        webhook_secret_set: Boolean(env.AUDIOTAP_WEBHOOK_SECRET),
        gemini_key_set: Boolean(env.GEMINI_API_KEY),
      });
    }

    // ── Audiotap webhook (HMAC, foydalanuvchi auth'i yo'q) ──
    if (path === "/api/webhooks/audiotap" && method === "POST") {
      return await handleWebhook(request, env);
    }

    // ── Auth ──
    if (path === "/api/auth/bootstrap" && method === "POST") return await handleBootstrap(request, env);
    if (path === "/api/auth/login" && method === "POST") {
      const rl = await checkRateLimit(env.DB, clientKey(request, "login"), 10, 60);
      if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
      return await handleLogin(request, env);
    }
    if (path === "/api/auth/register" && method === "POST") {
      const rl = await checkRateLimit(env.DB, clientKey(request, "register"), 30, 600);
      if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
      return await handleRegister(request, env);
    }
    if (path === "/api/auth/refresh" && method === "POST") {
      const rl = await checkRateLimit(env.DB, clientKey(request, "refresh"), 30, 60);
      if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
      return await handleRefresh(request, env);
    }

    if (path === "/api/users/me" && method === "GET") {
      const [user, uerr] = await requireUser(request, env);
      if (uerr) return uerr;
      return json({
        id: user.id, email: user.email, name: user.name, role: user.role,
        avatar: user.avatar, groups: await getEffectiveGroups(user, env),
        course_type: user.course_type, institution_id: user.institution_id || null,
      });
    }
    if (path === "/api/me/password" && method === "POST") {
      const [user, uerr] = await requireUser(request, env);
      if (uerr) return uerr;
      return await handleChangePassword(request, env, user);
    }

    // ── Bundan keyingi hamma narsa admin ──
    const [admin, aerr] = await requireAdmin(request, env);
    if (aerr) return aerr;

    if (path === "/api/system" && method === "GET") return await handleSystemInfo(request, env);
    if (path === "/api/system/replay-webhooks" && method === "POST") return json(await replayPendingWebhooks(env));
    if (path === "/api/dashboard/live" && method === "GET") return await dash.live(env);

    // ── Audiotap yozuvlari ──
    if (path === "/api/recordings" && method === "GET") return await rec.listRecordings(request, env);
    const m = path.match(/^\/api\/recordings\/(\d+)(\/[a-z]+)?$/);
    if (m) {
      const id = parseInt(m[1], 10);
      const sub = m[2] || "";
      if (sub === ""           && method === "GET")    return await rec.getRecording(env, id);
      if (sub === "/audio"     && method === "GET")    return await rec.streamAudio(request, env, id);
      if (sub === "/assign"    && method === "POST")   return await rec.assignRecording(request, env, id, admin);
      if (sub === "/reprocess" && method === "POST")   return await rec.reprocess(request, env, id);
      if (sub === ""           && method === "DELETE") return await rec.deleteRecording(env, id);
    }

    // ── Xonalar (audiotap manbalari) ──
    if (path === "/api/sources" && method === "GET") return await dir.listSources(env);
    const ms = path.match(/^\/api\/sources\/(\d+)$/);
    if (ms && (method === "PATCH" || method === "PUT")) return await dir.updateSource(request, env, parseInt(ms[1], 10));
    if (path === "/api/admin/auditoriums" && method === "GET") return await dir.listAuditoriums(env);

    // ── Admin: o'qituvchilar, statistika, dashboard (eyeziyo bilan bir xil) ──
    if (path === "/api/admin/teachers" && method === "GET") return await handleGetTeachers(request, env);
    if (path === "/api/admin/stats" && method === "GET") return await handleGetStats(request, env);
    if (path === "/api/admin/dashboard" && method === "GET") return await handleGetDashboard(request, env);

    const teacherDetailMatch = path.match(/^\/api\/admin\/teachers\/(\d+)\/detail$/);
    if (teacherDetailMatch && method === "GET") return await handleTeacherDetail(request, env, parseInt(teacherDetailMatch[1]));
    const teacherGroupsMatch = path.match(/^\/api\/admin\/teachers\/(\d+)\/groups$/);
    if (teacherGroupsMatch && method === "PUT") return await handleUpdateGroups(request, env, parseInt(teacherGroupsMatch[1]));

    const adminLessonMatch = path.match(/^\/api\/admin\/lessons\/(\d+)$/);
    if (adminLessonMatch && method === "GET") return await handleAdminLessonDetail(request, env, parseInt(adminLessonMatch[1]));
    const reevalMatch = path.match(/^\/api\/admin\/lessons\/(\d+)\/reevaluate$/);
    if (reevalMatch && method === "POST") return await handleAdminLessonReevaluate(request, env, parseInt(reevalMatch[1]));
    if (path === "/api/admin/lessons/reevaluate-batch" && method === "POST") return await handleAdminReevaluateBatch(request, env);

    if (path === "/api/admin/students" && method === "GET") return await handleAdminStudents(admin, env);
    const adminStudentMatch = path.match(/^\/api\/admin\/students\/(\d+)$/);
    if (adminStudentMatch && method === "GET") return await handleAdminStudentDetail(admin, env, parseInt(adminStudentMatch[1]));

    const teacherIdMatch = path.match(/^\/api\/admin\/teachers\/(\d+)$/);
    if (teacherIdMatch && method === "PUT") return await handleUpdateTeacher(request, env, parseInt(teacherIdMatch[1]));
    if (teacherIdMatch && method === "DELETE") return await handleDeleteTeacher(request, env, parseInt(teacherIdMatch[1]));

    // ── Muassasa ──
    if (path === "/api/admin/institution" && method === "GET") return await handleGetInstitution(admin, env);
    if (path === "/api/admin/institution" && method === "POST") return await handleCreateInstitution(request, admin, env);
    if (path === "/api/admin/institution" && method === "PUT") return await handleUpdateInstitution(request, admin, env);

    // ── Iyerarxiya ──
    if (path === "/api/admin/hierarchy" && method === "GET") return await handleListHierarchy(request, admin, env);
    if (path === "/api/admin/hierarchy" && method === "POST") return await handleCreateHierarchy(request, admin, env);
    const hierMatch = path.match(/^\/api\/admin\/hierarchy\/(\d+)$/);
    if (hierMatch && method === "PUT") return await handleUpdateHierarchy(request, admin, env, parseInt(hierMatch[1]));
    if (hierMatch && method === "DELETE") return await handleDeleteHierarchy(admin, env, parseInt(hierMatch[1]));

    // ── Fanlar ──
    if (path === "/api/admin/subjects" && method === "GET") return await handleListSubjects(admin, env);
    if (path === "/api/admin/subjects" && method === "POST") return await handleCreateSubject(request, admin, env);
    const subjMatch = path.match(/^\/api\/admin\/subjects\/(\d+)$/);
    if (subjMatch && method === "PUT") return await handleUpdateSubject(request, admin, env, parseInt(subjMatch[1]));
    if (subjMatch && method === "DELETE") return await handleDeleteSubject(admin, env, parseInt(subjMatch[1]));

    // ── Guruhlar ──
    if (path === "/api/admin/groups" && method === "GET") return await handleListGroups(request, admin, env);
    if (path === "/api/admin/groups" && method === "POST") return await handleCreateGroup(request, admin, env);
    const groupMatch = path.match(/^\/api\/admin\/groups\/(\d+)$/);
    if (groupMatch && method === "GET") return await handleGetGroup(admin, env, parseInt(groupMatch[1]));
    if (groupMatch && method === "PUT") return await handleUpdateGroup(request, admin, env, parseInt(groupMatch[1]));
    if (groupMatch && method === "DELETE") return await handleDeleteGroup(admin, env, parseInt(groupMatch[1]));

    // ── Biriktirishlar ──
    const tAssignMatch = path.match(/^\/api\/admin\/teachers\/(\d+)\/assignments$/);
    if (tAssignMatch && method === "GET") return await handleGetTeacherAssignments(admin, env, parseInt(tAssignMatch[1]));
    if (tAssignMatch && method === "PUT") return await handleSetTeacherAssignments(request, admin, env, parseInt(tAssignMatch[1]));
    const sGroupsMatch = path.match(/^\/api\/admin\/students\/(\d+)\/groups$/);
    if (sGroupsMatch && method === "PUT") return await handleSetStudentGroups(request, admin, env, parseInt(sGroupsMatch[1]));

    // ── Baholash savollari ──
    if (path === "/api/admin/evaluation-questions" && method === "GET") return await handleListEvalQuestions(admin, env);
    if (path === "/api/admin/evaluation-questions" && method === "POST") return await handleCreateEvalQuestion(request, admin, env);
    const evalQMatch = path.match(/^\/api\/admin\/evaluation-questions\/(\d+)$/);
    if (evalQMatch && method === "PUT") return await handleUpdateEvalQuestion(request, admin, env, parseInt(evalQMatch[1]));
    if (evalQMatch && method === "DELETE") return await handleDeleteEvalQuestion(admin, env, parseInt(evalQMatch[1]));
    const evalResultsMatch = path.match(/^\/api\/admin\/evaluation-questions\/(\d+)\/results$/);
    if (evalResultsMatch && method === "GET") return await handleEvalQuestionResults(admin, env, parseInt(evalResultsMatch[1]));

    return json({ detail: "Topilmadi" }, 404);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/row read limit|daily.*limit|code: 7500/i.test(msg)) {
      console.error("D1 kunlik limit:", msg);
      return json({ detail: "Ma'lumotlar bazasi kunlik limiti tugadi (Cloudflare D1). Yarim tunda (00:00 UTC) tiklanadi yoki tarifni oshiring." }, 503);
    }
    console.error("Worker xatosi:", e?.stack || e);
    return json({ detail: "Serverda xatolik" }, 500);
  }
}

export default {
  async fetch(request: Request, rawEnv: Env, _ctx: ExecutionContext): Promise<Response> {
    const env = cleanEnv(rawEnv);
    const res = await handleRequest(request, env);
    // Admin panel bir xil domenda (Worker assets) — CORS faqat lokal dev uchun kerak.
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) if (!h.has(k)) h.set(k, v);
    return new Response(res.body, { status: res.status, headers: h });
  },

  /** Queue consumer — bitta xabar = bitta yozuv. */
  async queue(batch: MessageBatch<Job>, rawEnv: Env): Promise<void> {
    const env = cleanEnv(rawEnv);
    for (const msg of batch.messages) {
      try {
        await runJob(msg.body, env);
        msg.ack();
      } catch (e: any) {
        console.error("Job xatosi:", msg.body, e?.message || e);
        msg.retry({ delaySeconds: 60 * Math.pow(2, msg.attempts - 1) });
      }
    }
  },

  /** Cron — R2 zaxirasini qayta ishlash + osilib qolgan ishlarni tiklash (har 10 daqiqada). */
  async scheduled(_evt: ScheduledController, rawEnv: Env, ctx: ExecutionContext): Promise<void> {
    const env = cleanEnv(rawEnv);
    ctx.waitUntil((async () => {
      try {
        const r = await replayPendingWebhooks(env);
        if (r.replayed || r.failed) console.log("Cron replay:", JSON.stringify(r));
      } catch (e: any) {
        console.error("Cron replay xatosi:", e?.message || e);
      }

      // Gemini Batch STT: tayyor job'lar → stt_collect; uzoq kutganlar → sinxron zaxira.
      try {
        const b = await pollSttBatches(env);
        if (b.checked) console.log("Cron batch:", JSON.stringify(b));
      } catch (e: any) {
        console.error("Cron batch xatosi:", e?.message || e);
      }

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
        await env.DB.prepare(`UPDATE recordings SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(r.id).run();
        await env.JOBS.send(job);
        console.log(`Cron: #${r.id} (${r.status}) qayta navbatga qo'yildi → ${job.type}`);
      }

      await env.DB.prepare(
        `UPDATE recordings SET status='failed',
                error = COALESCE(NULLIF(error,''), 'Maksimal urinish soniga yetdi')
          WHERE status IN ('queued','downloading','stored','transcribing','analyzing')
            AND attempts >= 5 AND updated_at < datetime('now','-30 minutes')`
      ).run();
    })());
  },
};

// ═══════════════════════════════════════════════════════════════
// Quyidagi handler'lar eyeziyo-worker/src/index.ts dan O'ZGARISHSIZ
// ko'chirilgan (assemble skripti orqali): login/register/refresh,
// teachers, stats, dashboard, teacher detail, lesson detail, reevaluate,
// update/delete teacher. Admin panel jarayonlari bir xil bo'lishi uchun.
// ═══════════════════════════════════════════════════════════════

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = (await request.json()) as any;
  if (!email || !password) return json({ detail: "Email va parol kerak" }, 400);

  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.toLowerCase().trim()).first();
  if (!user) return json({ detail: "Login yoki parol noto'g'ri" }, 401);

  const result = await verifyPassword(password, user.password_hash as string);
  if (!result.valid) return json({ detail: "Login yoki parol noto'g'ri" }, 401);

  // Transparent upgrade: legacy SHA-256 → PBKDF2 on successful login.
  if (result.needsRehash) {
    try {
      const newHash = await hashPassword(password);
      await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(newHash, user.id).run();
    } catch (e) {
      console.error("Password rehash failed (non-fatal):", e);
    }
  }

  const tokens = await issueTokens(env, user);
  return json(tokens);
}

/**
 * Issue a fresh access + refresh token pair, persisting the refresh JTI so
 * we can detect replay (single-use refresh tokens).
 */
async function issueTokens(env: Env, user: any): Promise<{
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}> {
  const accessToken = await signJWT(
    { sub: String(user.id), email: user.email, role: user.role, type: "access" },
    env.JWT_SECRET,
    TOKEN_EXPIRY_SECONDS
  );

  const jti = crypto.randomUUID();
  const refreshToken = await signJWT(
    { sub: String(user.id), email: user.email, type: "refresh", jti },
    env.JWT_SECRET,
    REFRESH_EXPIRY_SECONDS
  );

  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      "INSERT INTO refresh_tokens (jti, user_id, issued_at, expires_at) VALUES (?, ?, ?, ?)"
    ).bind(jti, user.id, now, now + REFRESH_EXPIRY_SECONDS).run();
  } catch (e) {
    console.error("Failed to persist refresh JTI (non-fatal):", e);
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: TOKEN_EXPIRY_SECONDS,
  };
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const { email, password, name, role, groups, course_type } = (await request.json()) as any;
  if (!email || !password || !name) return json({ detail: "Email, parol va ism kerak" }, 400);
  if (typeof password !== "string" || password.length < 8) {
    return json({ detail: "Parol kamida 8 belgi bo'lishi kerak" }, 400);
  }

  // If an authenticated admin is creating this user, inherit their institution + type.
  // This keeps demo data scoped to the active institution type.
  let institutionId: number | null = null;
  let userType: string | null = null;
  const caller = await getUser(request, env);
  const isAdminCaller = !!(caller && caller.role === "admin" && caller.institution_id);
  if (isAdminCaller) {
    institutionId = caller.institution_id;
    const instRow = await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(institutionId).first();
    userType = (instRow?.type as string) || null;
  }

  // `role` is privileged. An unauthenticated/self-registering caller must NEVER
  // be able to choose their own role — otherwise anyone could POST role:"admin"
  // and own the panel. Only an authenticated admin may assign a role; everyone
  // else is forced to a non-privileged default.
  const SELF_ROLES = new Set(["teacher", "student"]);
  const ADMIN_ROLES = new Set(["teacher", "student", "admin"]);
  let effectiveRole = "teacher";
  if (isAdminCaller) {
    effectiveRole = typeof role === "string" && ADMIN_ROLES.has(role) ? role : "teacher";
  } else {
    effectiveRole = typeof role === "string" && SELF_ROLES.has(role) ? role : "teacher";
  }

  const hash = await hashPassword(password);

  try {
    const result = await env.DB.prepare(
      `INSERT INTO users (email, password_hash, name, role, avatar, groups, course_type, institution_id, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      email.toLowerCase().trim(), hash, name, effectiveRole,
      name.charAt(0).toUpperCase(), JSON.stringify(groups || []), course_type || "",
      institutionId, userType
    ).run();

    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email.toLowerCase()).first();
    return json({
      id: user!.id, email: user!.email, name: user!.name, role: user!.role,
      avatar: user!.avatar, groups: JSON.parse((user!.groups || "[]") as string),
      course_type: user!.course_type,
    }, 201);
  } catch {
    return json({ detail: "Bu email allaqachon ro'yxatdan o'tgan" }, 409);
  }
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  const { refresh_token } = (await request.json()) as any;
  if (!refresh_token) return json({ detail: "Refresh token kerak" }, 400);

  const payload = await verifyJWT(refresh_token, env.JWT_SECRET);
  if (!payload || payload.type !== "refresh") return json({ detail: "Token yaroqsiz" }, 401);

  const jti = typeof payload.jti === "string" ? payload.jti : null;

  // Refresh-token rotation: each refresh token is single-use. If we already
  // marked this jti as used, reject — and revoke the user's other refresh
  // tokens, since reuse implies the token was compromised.
  if (jti) {
    const row = await env.DB.prepare(
      "SELECT used_at FROM refresh_tokens WHERE jti = ?"
    ).bind(jti).first<{ used_at: number | null }>();
    if (!row) {
      return json({ detail: "Token yaroqsiz" }, 401);
    }
    if (row.used_at) {
      // Replay detected — kill all this user's refresh tokens.
      try {
        await env.DB.prepare(
          "UPDATE refresh_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL"
        ).bind(Math.floor(Date.now() / 1000), payload.sub).run();
      } catch {}
      return json({ detail: "Token allaqachon ishlatilgan, qaytadan kiring" }, 401);
    }
    await env.DB.prepare(
      "UPDATE refresh_tokens SET used_at = ? WHERE jti = ?"
    ).bind(Math.floor(Date.now() / 1000), jti).run();
  }
  // Tokens issued before rotation existed (no jti) are still accepted once,
  // but won't get tracked — they'll naturally expire.

  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user) return json({ detail: "Foydalanuvchi topilmadi" }, 401);

  const tokens = await issueTokens(env, user);
  return json(tokens);
}

async function handleGetTeachers(request: Request, env: Env): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;

  const instId = admin.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  // Single aggregate query instead of N+1 (was 2 extra round-trips per teacher).
  // avg_score and last_lesson are computed with correlated subqueries so the
  // per-teacher lesson aggregates aren't distorted by the evaluations join.
  const teachers = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, u.course_type, u.groups,
           COUNT(l.id) AS total_lessons,
           COALESCE(SUM(l.duration_seconds), 0) AS total_duration,
           (SELECT AVG(e.overall_score) FROM evaluations e
              JOIN lessons l2 ON e.lesson_id = l2.id WHERE l2.user_id = u.id) AS avg_score,
           (SELECT MAX(l3.created_at) FROM lessons l3 WHERE l3.user_id = u.id) AS last_lesson_date
    FROM users u LEFT JOIN lessons l ON u.id = l.user_id
    WHERE u.role = 'teacher' AND u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
    GROUP BY u.id ORDER BY u.name
  `).bind(instId, instType).all();

  const result = teachers.results.map((t: any) => ({
    user_id: t.id, name: t.name, email: t.email, avatar: t.avatar,
    course_type: t.course_type, groups: JSON.parse((t.groups || "[]") as string),
    total_lessons: t.total_lessons,
    total_duration_minutes: Math.floor((t.total_duration as number) / 60),
    average_score: Math.round((t.avg_score as number) || 0),
    last_lesson_date: t.last_lesson_date || null,
  }));

  return json(result);
}

async function handleGetStats(request: Request, env: Env): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;

  const instId = admin.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  const teachers = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE role = 'teacher' AND institution_id = ? AND (type IS NULL OR type = ?)"
  ).bind(instId, instType).first();
  const students = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE role = 'student' AND institution_id = ? AND (type IS NULL OR type = ?)"
  ).bind(instId, instType).first();
  const lessons = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM lessons l
     JOIN users u ON u.id = l.user_id
     WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)`
  ).bind(instId, instType).first();
  const duration = await env.DB.prepare(
    `SELECT COALESCE(SUM(l.duration_seconds), 0) as s FROM lessons l
     JOIN users u ON u.id = l.user_id
     WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)`
  ).bind(instId, instType).first();
  const avgScore = await env.DB.prepare(
    `SELECT AVG(e.overall_score) as a FROM evaluations e
     JOIN lessons l ON l.id = e.lesson_id
     JOIN users u ON u.id = l.user_id
     WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)`
  ).bind(instId, instType).first();
  const attempts = await env.DB.prepare(
    `SELECT COUNT(*) as c, AVG(ta.score) as avg FROM test_attempts ta
     JOIN users u ON u.id = ta.student_id
     WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)`
  ).bind(instId, instType).first();

  return json({
    total_teachers: teachers?.c || 0,
    total_students: students?.c || 0,
    total_lessons: lessons?.c || 0,
    total_duration_hours: Math.floor(((duration?.s as number) || 0) / 3600),
    average_engagement_score: Math.round((avgScore?.a as number) || 0),
    total_test_attempts: attempts?.c || 0,
    average_test_score: Math.round((attempts?.avg as number) || 0),
    lessons_today: 0,
  });
}

// Rich dashboard payload — per-criterion averages, trend, weekly activity
// heatmap, quality distribution, recent lessons and low-score alerts.
// Everything is aggregated read-only from real evaluations/lessons.
async function handleGetDashboard(request: Request, env: Env): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;

  const instId = admin.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  // Per-criterion averages (each 0-20) across all institution evaluations.
  const crit = await env.DB.prepare(`
    SELECT COUNT(*) AS c,
           AVG(e.topic_score) AS topic, AVG(e.speech_score) AS speech,
           AVG(e.method_score) AS method, AVG(e.interaction_score) AS interaction,
           AVG(e.feedback_score) AS feedback
    FROM evaluations e
    JOIN lessons l ON l.id = e.lesson_id
    JOIN users u ON u.id = l.user_id
    WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
  `).bind(instId, instType).first();

  const round1 = (v: any) => Math.round(((v as number) || 0) * 10) / 10;
  const criteria = {
    topic: round1(crit?.topic),
    speech: round1(crit?.speech),
    method: round1(crit?.method),
    interaction: round1(crit?.interaction),
    feedback: round1(crit?.feedback),
  };
  const criteriaCount = (crit?.c as number) || 0;

  // Recent evaluated lessons (institution-wide).
  const recentRows = await env.DB.prepare(`
    SELECT l.id, l.topic, l.group_name, l.course_type, l.created_at,
           u.name AS teacher_name, e.overall_score
    FROM lessons l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN evaluations e ON e.lesson_id = l.id
    WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
    ORDER BY l.created_at DESC LIMIT 6
  `).bind(instId, instType).all();
  const recent_lessons = recentRows.results.map((r: any) => ({
    id: r.id, topic: r.topic, group_name: r.group_name,
    course_type: r.course_type, teacher_name: r.teacher_name,
    score: Math.round((r.overall_score as number) || 0),
    created_at: r.created_at,
  }));

  // Raw evaluated lessons (last ~120 days) for trend + heatmap + distribution.
  const evalRows = await env.DB.prepare(`
    SELECT l.created_at AS created_at, e.overall_score AS score
    FROM evaluations e
    JOIN lessons l ON l.id = e.lesson_id
    JOIN users u ON u.id = l.user_id
    WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
    ORDER BY l.created_at ASC
  `).bind(instId, instType).all();

  const rows = evalRows.results as any[];

  // Quality distribution by band.
  const distribution = { excellent: 0, good: 0, average: 0, weak: 0 };
  for (const r of rows) {
    const s = (r.score as number) || 0;
    if (s >= 85) distribution.excellent++;
    else if (s >= 70) distribution.good++;
    else if (s >= 50) distribution.average++;
    else distribution.weak++;
  }

  // Weekly score trend — split the evaluated lessons into up to 8 ordered
  // buckets and average each; gives a stable dynamic line from real data.
  const N = 8;
  const score_trend: { label: string; value: number }[] = [];
  if (rows.length > 0) {
    const per = Math.ceil(rows.length / N);
    for (let i = 0; i < N; i++) {
      const slice = rows.slice(i * per, i * per + per);
      if (!slice.length) continue;
      const avg = slice.reduce((s, r) => s + ((r.score as number) || 0), 0) / slice.length;
      score_trend.push({ label: `${i + 1}`, value: Math.round(avg) });
    }
  }

  // Weekly activity heatmap: day-of-week (Mon..Sun) x 4 time slots.
  // Slots: 0=ertalab(6-10), 1=tush(10-14), 2=kunduz(14-18), 3=kech(18-22).
  const heatmap: number[][] = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  for (const r of rows) {
    const d = new Date((r.created_at as string).replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) continue;
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    const h = d.getUTCHours();
    let slot = 0;
    if (h >= 18) slot = 3;
    else if (h >= 14) slot = 2;
    else if (h >= 10) slot = 1;
    else slot = 0;
    heatmap[dow][slot]++;
  }

  // Low-score teacher alerts (avg overall < 60), worst first.
  const alertRows = await env.DB.prepare(`
    SELECT u.id, u.name, AVG(e.overall_score) AS avg_score, COUNT(e.id) AS n
    FROM users u
    JOIN lessons l ON l.user_id = u.id
    JOIN evaluations e ON e.lesson_id = l.id
    WHERE u.role = 'teacher' AND u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
    GROUP BY u.id
    HAVING avg_score < 60
    ORDER BY avg_score ASC LIMIT 5
  `).bind(instId, instType).all();
  const alerts = alertRows.results.map((a: any) => ({
    teacher_id: a.id, teacher_name: a.name,
    score: Math.round((a.avg_score as number) || 0),
    lessons: (a.n as number) || 0,
    level: ((a.avg_score as number) || 0) < 45 ? "danger" : "warning",
  }));

  // This week vs previous week: lesson count, evaluated average, minutes.
  const weekRow = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN l.created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS cur_lessons,
      SUM(CASE WHEN l.created_at >= datetime('now','-14 days') AND l.created_at < datetime('now','-7 days') THEN 1 ELSE 0 END) AS prev_lessons,
      SUM(CASE WHEN l.created_at >= datetime('now','-7 days') THEN l.duration_seconds ELSE 0 END) AS cur_sec,
      SUM(CASE WHEN l.created_at >= datetime('now','-14 days') AND l.created_at < datetime('now','-7 days') THEN l.duration_seconds ELSE 0 END) AS prev_sec,
      AVG(CASE WHEN l.created_at >= datetime('now','-7 days') THEN e.overall_score END) AS cur_avg,
      AVG(CASE WHEN l.created_at >= datetime('now','-14 days') AND l.created_at < datetime('now','-7 days') THEN e.overall_score END) AS prev_avg
    FROM lessons l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN evaluations e ON e.lesson_id = l.id
    WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
  `).bind(instId, instType).first();
  const week = {
    lessons: { current: (weekRow?.cur_lessons as number) || 0, previous: (weekRow?.prev_lessons as number) || 0 },
    minutes: { current: Math.round(((weekRow?.cur_sec as number) || 0) / 60), previous: Math.round(((weekRow?.prev_sec as number) || 0) / 60) },
    avg_score: { current: Math.round((weekRow?.cur_avg as number) || 0), previous: Math.round((weekRow?.prev_avg as number) || 0) },
  };

  // Teacher coverage: how many teachers actually record lessons.
  const covRow = await env.DB.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN last_at IS NOT NULL THEN 1 ELSE 0 END) AS with_lessons,
           SUM(CASE WHEN last_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS active_7d
    FROM (
      SELECT u.id, MAX(l.created_at) AS last_at
      FROM users u
      LEFT JOIN lessons l ON l.user_id = u.id
      WHERE u.role = 'teacher' AND u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
      GROUP BY u.id
    )
  `).bind(instId, instType).first();
  const coverage = {
    total_teachers: (covRow?.total as number) || 0,
    with_lessons: (covRow?.with_lessons as number) || 0,
    active_7d: (covRow?.active_7d as number) || 0,
  };

  // Teachers who used to record but went silent (no lesson for 14+ days).
  const idleRows = await env.DB.prepare(`
    SELECT u.id, u.name, MAX(l.created_at) AS last_at, COUNT(l.id) AS n
    FROM users u
    JOIN lessons l ON l.user_id = u.id
    WHERE u.role = 'teacher' AND u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
    GROUP BY u.id
    HAVING last_at < datetime('now','-14 days')
    ORDER BY last_at ASC LIMIT 5
  `).bind(instId, instType).all();
  const idle_teachers = idleRows.results.map((r: any) => ({
    teacher_id: r.id, teacher_name: r.name,
    last_lesson_at: r.last_at, lessons: (r.n as number) || 0,
  }));

  // Group ranking by evaluated average score.
  const groupRows = await env.DB.prepare(`
    SELECT l.group_name, COUNT(DISTINCT l.id) AS n, AVG(e.overall_score) AS avg_score
    FROM lessons l
    JOIN users u ON u.id = l.user_id
    JOIN evaluations e ON e.lesson_id = l.id
    WHERE u.institution_id = ? AND (u.type IS NULL OR u.type = ?)
      AND l.group_name IS NOT NULL AND l.group_name != ''
    GROUP BY l.group_name
    ORDER BY avg_score DESC LIMIT 6
  `).bind(instId, instType).all();
  const group_perf = groupRows.results.map((g: any) => ({
    group_name: g.group_name,
    lessons: (g.n as number) || 0,
    average_score: Math.round((g.avg_score as number) || 0),
  }));

  // Teacher/student speaking split estimate from average interaction score.
  // interaction 0..20 → student share 22%..48% (higher interaction ⇒ more
  // student talk). Purely derived indicator, not a raw recording metric.
  const studentShare = Math.round(22 + (criteria.interaction / 20) * 26);

  return json({
    criteria,
    criteria_count: criteriaCount,
    recent_lessons,
    score_trend,
    distribution,
    heatmap,
    alerts,
    speaking: { teacher: 100 - studentShare, student: studentShare },
    evaluated_lessons: rows.length,
    week,
    coverage,
    idle_teachers,
    group_perf,
  });
}

async function handleTeacherDetail(request: Request, env: Env, teacherId: number): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;

  const instId = admin.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  const teacher = await env.DB.prepare(
    `SELECT * FROM users WHERE id = ? AND role = 'teacher'
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(teacherId, instId, instType).first();
  if (!teacher) return json({ detail: "O'qituvchi topilmadi" }, 404);

  const lessons = await env.DB.prepare(`
    SELECT l.*, e.overall_score FROM lessons l
    LEFT JOIN evaluations e ON l.id = e.lesson_id
    WHERE l.user_id = ? ORDER BY l.created_at DESC
  `).bind(teacherId).all();

  const groupStats: Record<string, any> = {};
  for (const l of lessons.results) {
    const g = (l.group_name as string) || "—";
    if (!groupStats[g]) {
      groupStats[g] = { group_name: g, course_type: l.course_type, total_lessons: 0, total_duration_seconds: 0, score_sum: 0, score_count: 0, last_lesson_date: null };
    }
    const entry = groupStats[g];
    entry.total_lessons++;
    entry.total_duration_seconds += (l.duration_seconds as number) || 0;
    if (l.overall_score) { entry.score_sum += l.overall_score as number; entry.score_count++; }
    if (!entry.last_lesson_date || (l.created_at as string) > entry.last_lesson_date) entry.last_lesson_date = l.created_at;
  }

  const groups = Object.values(groupStats).map((e: any) => ({
    group_name: e.group_name, course_type: e.course_type, total_lessons: e.total_lessons,
    total_duration_minutes: Math.floor(e.total_duration_seconds / 60),
    average_score: e.score_count > 0 ? Math.round(e.score_sum / e.score_count) : 0,
    last_lesson_date: e.last_lesson_date,
  })).sort((a, b) => b.average_score - a.average_score);

  const totalScoreSum = lessons.results.reduce((s, l) => s + ((l.overall_score as number) || 0), 0);
  const totalScoreCount = lessons.results.filter(l => l.overall_score).length;
  const totalDurationSec = lessons.results.reduce((s, l) => s + ((l.duration_seconds as number) || 0), 0);

  // Last 5 lessons for trend
  const recentScores = lessons.results
    .filter((l: any) => l.overall_score)
    .slice(0, 5)
    .map((l: any) => ({ score: l.overall_score, date: l.created_at, topic: l.topic }));

  // Get evaluation details for strengths/weaknesses summary
  const evalDetails = await env.DB.prepare(`
    SELECT e.strengths, e.improvements, e.advice FROM evaluations e
    JOIN lessons l ON e.lesson_id = l.id WHERE l.user_id = ? ORDER BY e.created_at DESC LIMIT 5
  `).bind(teacherId).all();

  // Collect common strengths and improvements
  const allStrengths: string[] = [];
  const allImprovements: string[] = [];
  for (const ev of evalDetails.results) {
    try { allStrengths.push(...JSON.parse((ev.strengths || "[]") as string)); } catch {}
    try { allImprovements.push(...JSON.parse((ev.improvements || "[]") as string)); } catch {}
  }

  return json({
    user_id: teacher.id, name: teacher.name, email: teacher.email, avatar: teacher.avatar,
    course_type: teacher.course_type, groups: JSON.parse((teacher.groups || "[]") as string),
    total_lessons: lessons.results.length,
    average_score: totalScoreCount > 0 ? Math.round(totalScoreSum / totalScoreCount) : 0,
    total_duration_minutes: Math.round(totalDurationSec / 60),
    avg_duration_minutes: lessons.results.length > 0 ? Math.round(totalDurationSec / 60 / lessons.results.length) : 0,
    group_stats: groups,
    recent_trend: recentScores,
    top_strengths: allStrengths.slice(0, 5),
    top_improvements: allImprovements.slice(0, 5),
    lessons: lessons.results.map((l: any) => ({
      id: l.id, group_name: l.group_name, topic: l.topic, course_type: l.course_type,
      duration_seconds: l.duration_seconds, created_at: l.created_at, score: l.overall_score || 0,
    })),
  });
}

async function handleAdminLessonDetail(request: Request, env: Env, lessonId: number): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;

  const instId = admin.institution_id;

  const lesson = await env.DB.prepare(`
    SELECT l.*, u.name as teacher_name, u.email as teacher_email
    FROM lessons l JOIN users u ON l.user_id = u.id
    WHERE l.id = ? AND u.institution_id = ?
  `).bind(lessonId, instId).first();
  if (!lesson) return json({ detail: "Dars topilmadi" }, 404);

  // AI evaluation
  const evaluation = await env.DB.prepare(
    "SELECT * FROM evaluations WHERE lesson_id = ?"
  ).bind(lessonId).first();

  // Student questionnaire evaluations
  const studentEvals = await env.DB.prepare(`
    SELECT sle.rating, sle.student_id, sle.submitted_at,
           eq.text as question_text, eq.scale as question_scale,
           su.name as student_name
    FROM student_lesson_evaluations sle
    JOIN evaluation_questions eq ON sle.question_id = eq.id
    JOIN users su ON sle.student_id = su.id
    WHERE sle.lesson_id = ?
    ORDER BY eq.sort_order, eq.id, su.name
  `).bind(lessonId).all();

  // Group by question
  const questionMap: Record<string, { text: string; scale: number; ratings: Array<{ student_name: string; rating: number }> }> = {};
  for (const se of studentEvals.results) {
    const key = se.question_text as string;
    if (!questionMap[key]) {
      questionMap[key] = { text: key, scale: se.question_scale as number, ratings: [] };
    }
    questionMap[key].ratings.push({
      student_name: se.student_name as string,
      rating: se.rating as number,
    });
  }
  const questionSummaries = Object.values(questionMap).map(q => ({
    text: q.text,
    scale: q.scale,
    count: q.ratings.length,
    average: q.ratings.length > 0 ? Math.round(q.ratings.reduce((s, r) => s + r.rating, 0) / q.ratings.length * 10) / 10 : 0,
    ratings: q.ratings,
  }));

  return json({
    id: lesson.id,
    teacher_name: lesson.teacher_name,
    teacher_email: lesson.teacher_email,
    group_name: lesson.group_name,
    topic: lesson.topic,
    course_type: lesson.course_type,
    duration_seconds: lesson.duration_seconds,
    transcript: lesson.transcript || "",
    created_at: lesson.created_at,
    ai_evaluation: evaluation ? {
      overall_score: evaluation.overall_score,
      topic_score: evaluation.topic_score,
      speech_score: evaluation.speech_score,
      method_score: evaluation.method_score,
      interaction_score: evaluation.interaction_score,
      feedback_score: evaluation.feedback_score,
      summary: evaluation.summary,
      strengths: JSON.parse((evaluation.strengths || "[]") as string),
      improvements: JSON.parse((evaluation.improvements || "[]") as string),
      advice: JSON.parse((evaluation.advice || "[]") as string),
    } : null,
    student_evaluations: questionSummaries,
  });
}

async function reevaluateLessonRow(env: Env, lesson: any): Promise<LessonEvaluationResult> {
  const durationMinutes = Math.max(1, Math.round(((lesson.duration_seconds as number) || 0) / 60));
  const evaluation = await evaluateLesson(
    env.GEMINI_API_KEY,
    (lesson.transcript as string) || "",
    (lesson.course_type as string) || "",
    (lesson.topic as string) || "",
    durationMinutes
  );
  if (!evaluation.overall_score && !evaluation.summary) return { ok: false };
  await env.DB.prepare(`
    INSERT OR REPLACE INTO evaluations
    (lesson_id, overall_score, topic_score, speech_score, method_score, interaction_score, feedback_score, summary, strengths, improvements, advice, model, timeline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    lesson.id,
    evaluation.overall_score,
    evaluation.topic_score,
    evaluation.speech_score,
    evaluation.method_score,
    evaluation.interaction_score,
    evaluation.feedback_score,
    evaluation.summary,
    JSON.stringify(evaluation.strengths),
    JSON.stringify(evaluation.improvements),
    JSON.stringify(evaluation.advice),
    evaluation.model || "",
    evaluation.timeline ? JSON.stringify(evaluation.timeline) : ""
  ).run();
  return { ok: true, evaluation };
}

type LessonEvaluationResult = { ok: boolean; evaluation?: Awaited<ReturnType<typeof evaluateLesson>> };

async function handleAdminLessonReevaluate(request: Request, env: Env, lessonId: number): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;
  if (!env.GEMINI_API_KEY) return json({ detail: "Gemini API kaliti sozlanmagan" }, 503);

  const lesson = await env.DB.prepare(`
    SELECT l.* FROM lessons l JOIN users u ON l.user_id = u.id
    WHERE l.id = ? AND u.institution_id = ?
  `).bind(lessonId, admin.institution_id).first();
  if (!lesson) return json({ detail: "Dars topilmadi" }, 404);
  if (!lesson.transcript || String(lesson.transcript).trim().length < 20) {
    return json({ detail: "Bu darsda transkripsiya yo'q — qayta tahlil qilib bo'lmaydi" }, 400);
  }

  const res = await reevaluateLessonRow(env, lesson);
  if (!res.ok) return json({ detail: "AI tahlili muvaffaqiyatsiz tugadi, keyinroq urinib ko'ring" }, 502);
  return json({ lesson_id: lessonId, evaluation: res.evaluation });
}

// Re-evaluates up to `limit` lessons (per admin's institution) whose stored
// evaluation has fewer than 5 advice items. Returns the remaining count so the
// caller can loop until done.
async function handleAdminReevaluateBatch(request: Request, env: Env): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;
  if (!env.GEMINI_API_KEY) return json({ detail: "Gemini API kaliti sozlanmagan" }, 503);

  let limit = 3;
  try {
    const body = (await request.json()) as any;
    if (body && Number.isFinite(Number(body.limit))) limit = Math.max(1, Math.min(5, Math.round(Number(body.limit))));
  } catch { /* empty body is fine */ }

  const staleWhere = `
    l.transcript IS NOT NULL AND length(trim(l.transcript)) >= 20
    AND u.institution_id = ?
    AND e.lesson_id IS NOT NULL
    AND json_array_length(COALESCE(e.advice, '[]')) < 5
  `;
  const candidates = await env.DB.prepare(`
    SELECT l.* FROM lessons l
    JOIN users u ON l.user_id = u.id
    LEFT JOIN evaluations e ON e.lesson_id = l.id
    WHERE ${staleWhere}
    ORDER BY l.id LIMIT ?
  `).bind(admin.institution_id, limit).all();

  const done: number[] = [];
  const failed: number[] = [];
  for (const lesson of candidates.results) {
    const res = await reevaluateLessonRow(env, lesson);
    (res.ok ? done : failed).push(lesson.id as number);
  }

  const remaining = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM lessons l
    JOIN users u ON l.user_id = u.id
    LEFT JOIN evaluations e ON e.lesson_id = l.id
    WHERE ${staleWhere}
  `).bind(admin.institution_id).first();

  return json({ done, failed, remaining: (remaining?.n as number) || 0 });
}

async function handleUpdateGroups(request: Request, env: Env, teacherId: number): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;

  // Scope to the admin's own institution — otherwise an admin could rewrite the
  // groups of a teacher belonging to a different institution (IDOR).
  const instId = admin.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;
  const teacher = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND role = 'teacher'
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(teacherId, instId, instType).first();
  if (!teacher) return json({ detail: "O'qituvchi topilmadi" }, 404);

  const { groups } = (await request.json()) as any;

  // Support both formats:
  // Old: ["BE5", "BE6"]
  // New: [{"name":"BE5","course":"Backend dasturlash"}, ...]
  const cleaned: Array<{name: string, course: string}> = [];
  const seen = new Set<string>();
  for (const g of (groups || [])) {
    const name = (typeof g === "string" ? g : g.name || "").trim();
    const course = (typeof g === "string" ? "" : g.course || "").trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      cleaned.push({ name, course });
    }
  }

  await env.DB.prepare("UPDATE users SET groups = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(JSON.stringify(cleaned), teacherId).run();

  return json({ user_id: teacherId, groups: cleaned });
}

async function handleUpdateTeacher(request: Request, env: Env, teacherId: number): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;

  const instId = admin.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  const teacher = await env.DB.prepare(
    `SELECT * FROM users WHERE id = ? AND role = 'teacher'
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(teacherId, instId, instType).first();
  if (!teacher) return json({ detail: "O'qituvchi topilmadi" }, 404);

  const body = (await request.json()) as any;
  const fields: string[] = [];
  const values: any[] = [];

  if (typeof body.name === "string" && body.name.trim()) {
    fields.push("name = ?");
    values.push(body.name.trim());
    // refresh avatar (first char) when the name changes
    fields.push("avatar = ?");
    values.push(body.name.trim().charAt(0).toUpperCase());
  }
  if (typeof body.email === "string" && body.email.trim()) {
    const email = body.email.toLowerCase().trim();
    if (email !== teacher.email) {
      const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id != ?")
        .bind(email, teacherId).first();
      if (existing) return json({ detail: "Bu email boshqa foydalanuvchida band" }, 409);
    }
    fields.push("email = ?");
    values.push(email);
  }
  if (typeof body.course_type === "string") {
    fields.push("course_type = ?");
    values.push(body.course_type.trim());
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return json({ detail: "Parol kamida 8 belgi bo'lishi kerak" }, 400);
    }
    const hash = await hashPassword(body.password);
    fields.push("password_hash = ?");
    values.push(hash);
  }

  if (fields.length === 0) return json({ detail: "O'zgartirish uchun maydon yo'q" }, 400);

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(teacherId);

  await env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(teacherId).first();
  return json({
    id: updated!.id,
    email: updated!.email,
    name: updated!.name,
    role: updated!.role,
    avatar: updated!.avatar,
    groups: JSON.parse((updated!.groups || "[]") as string),
    course_type: updated!.course_type,
  });
}

async function handleDeleteTeacher(request: Request, env: Env, teacherId: number): Promise<Response> {
  const [admin, err] = await requireAdmin(request, env);
  if (err) return err;

  if (admin.id === teacherId) return json({ detail: "O'zingizni o'chira olmaysiz" }, 400);

  const instId = admin.institution_id;
  const instRow = instId ? await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first() : null;
  const instType = (instRow?.type as string) || null;

  const teacher = await env.DB.prepare(
    `SELECT id, role FROM users WHERE id = ?
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(teacherId, instId, instType).first();
  if (!teacher) return json({ detail: "Foydalanuvchi topilmadi" }, 404);
  if (teacher.role !== "teacher") return json({ detail: "Faqat o'qituvchilarni o'chirish mumkin" }, 400);

  // Cascade: evaluations → lessons → teacher_groups/teacher_subjects → user
  await env.DB.prepare(
    "DELETE FROM evaluations WHERE lesson_id IN (SELECT id FROM lessons WHERE user_id = ?)"
  ).bind(teacherId).run();
  await env.DB.prepare("DELETE FROM lessons WHERE user_id = ?").bind(teacherId).run();
  await env.DB.prepare("DELETE FROM teacher_groups WHERE teacher_id = ?").bind(teacherId).run();
  await env.DB.prepare("DELETE FROM teacher_subjects WHERE teacher_id = ?").bind(teacherId).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(teacherId).run();

  return json({ status: "ok", deleted_user_id: teacherId });
}
