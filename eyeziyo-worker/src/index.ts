/**
 * Eyeziyo API — Cloudflare Worker
 *
 * Endpoints:
 *   POST /api/auth/login
 *   POST /api/auth/register
 *   POST /api/auth/refresh
 *   POST /api/auth/hemis-sso
 *   GET  /api/users/me
 *   GET  /api/lessons
 *   POST /api/lessons
 *   GET  /api/lessons/:id
 *   POST /api/lessons/:id/evaluation
 *   GET  /api/admin/teachers
 *   GET  /api/admin/stats
 *   GET  /api/admin/teachers/:id/detail
 *   PUT  /api/admin/teachers/:id/groups
 *   GET  /api/admin/hemis/status
 *   POST /api/admin/hemis/sync
 *   GET  /ws/transcribe (WebSocket → Durable Object)
 *   GET  /health
 */

import { signJWT, verifyJWT, verifyPassword, hashPassword, TOKEN_EXPIRY_SECONDS, REFRESH_EXPIRY_SECONDS } from "./auth";
import { transcribeAudioFile, evaluateLesson } from "./gemini";
import { RecordingSession } from "./session";
import { checkRateLimit, clientKey } from "./rateLimit";
import {
  handleListStudents, handleCreateStudent, handleUpdateStudent, handleDeleteStudent,
  handleMentorLessons, handleMentorLesson,
  handleMentorTest, handleMentorSubmitTest,
  handleMentorChatHistory, handleMentorChatSend,
  handleMentorEvaluationGet, handleMentorEvaluationSubmit, handleMentorEvaluationPending,
} from "./mentor";
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
import { handleAiAsk, handleAiTts, handleAiStt } from "./ai-assistant";
import { hemisConfigured, ssoConfigured, HemisError } from "./hemis-client";
import { runSync, SyncScope } from "./hemis-sync";
import { resolveSsoUser } from "./hemis-sso";

export { RecordingSession };

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  JWT_SECRET: string;
  DB: D1Database;
  RECORDING_SESSION: DurableObjectNamespace;
  // HEMIS integration (optional). Base URL is a var; token/secret are secrets.
  HEMIS_BASE_URL?: string;
  HEMIS_API_TOKEN?: string;
  HEMIS_SSO_SECRET?: string;
}

// ── CORS ──
// Origin whitelist for browser callers (admin panel + local dev).
// Mobile clients send no Origin header, so they bypass CORS entirely — that's fine.
const ALLOWED_ORIGINS = new Set<string>([
  "https://admin.eyeziyo.uz",
  "https://eyeziyo.uz",
  "https://www.eyeziyo.uz",
  "https://eyeziyo-admin.pages.dev",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
]);

// Cloudflare Pages assigns each deployment a unique preview URL of the form
// https://<hash>.eyeziyo-admin.pages.dev — accept any of those too.
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/[a-z0-9-]+\.eyeziyo-admin\.pages\.dev$/,
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

/** Build CORS headers for a specific request's Origin. */
function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

/** Apply CORS headers onto an existing response (won't overwrite Content-Type etc.). */
function withCors(response: Response, request: Request): Response {
  const cors = corsHeadersFor(request);
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) newHeaders.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ detail: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, retryAfter)),
      },
    }
  );
}

// ── Auth middleware ──
async function getUser(request: Request, env: Env): Promise<any | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload?.sub) return null;

  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
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

/**
 * Resolve the effective group-name list for a user.
 * Teachers: prefer the normalized teacher_groups → groups_v2 join (what the
 * admin panel writes). Fall back to the legacy users.groups JSON column for
 * teachers created before the migration. Students/admins: just the legacy
 * column.
 */
async function getEffectiveGroups(user: any, env: Env): Promise<string[]> {
  if (user.role === "teacher") {
    try {
      const rows = await env.DB.prepare(
        `SELECT g.name FROM groups_v2 g
         JOIN teacher_groups tg ON tg.group_id = g.id
         WHERE tg.teacher_id = ?
         ORDER BY g.name`
      ).bind(user.id).all();
      const names = (rows.results || [])
        .map((r: any) => String(r.name || "").trim())
        .filter(Boolean);
      if (names.length > 0) return names;
    } catch {
      // fall through to legacy
    }
  }
  try {
    const legacy = JSON.parse((user.groups as string) || "[]");
    return Array.isArray(legacy) ? legacy.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// ── Route handler ──
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
      // ── Health ──
      if (path === "/health") {
        return json({
          status: "healthy",
          version: "2.0.0-workers",
          services: { gemini: !!env.GEMINI_API_KEY, database: true },
          runtime: "cloudflare-workers",
        });
      }

      // ── Auth routes (rate limited per IP) ──
      if (path === "/api/auth/login" && method === "POST") {
        const rl = await checkRateLimit(env.DB, clientKey(request, "login"), 10, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleLogin(request, env);
      }
      if (path === "/api/auth/register" && method === "POST") {
        const rl = await checkRateLimit(env.DB, clientKey(request, "register"), 5, 600);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleRegister(request, env);
      }
      if (path === "/api/auth/refresh" && method === "POST") {
        const rl = await checkRateLimit(env.DB, clientKey(request, "refresh"), 30, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleRefresh(request, env);
      }
      if (path === "/api/auth/hemis-sso" && method === "POST") {
        const rl = await checkRateLimit(env.DB, clientKey(request, "hemis-sso"), 10, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleHemisSso(request, env);
      }

      // ── User ──
      if (path === "/api/users/me" && method === "GET") {
        const [user, err] = await requireUser(request, env);
        if (err) return err;
        return json({
          id: user.id, email: user.email, name: user.name, role: user.role,
          avatar: user.avatar, groups: await getEffectiveGroups(user, env),
          course_type: user.course_type,
          institution_id: user.institution_id || null,
        });
      }

      // ── Lessons ──
      if (path === "/api/lessons" && method === "GET") {
        return handleGetLessons(request, env);
      }
      if (path === "/api/lessons" && method === "POST") {
        return handleCreateLesson(request, env);
      }

      const lessonMatch = path.match(/^\/api\/lessons\/(\d+)$/);
      if (lessonMatch && method === "GET") {
        return handleGetLesson(request, env, parseInt(lessonMatch[1]));
      }

      // ── Admin ──
      if (path === "/api/admin/teachers" && method === "GET") {
        return handleGetTeachers(request, env);
      }
      if (path === "/api/admin/stats" && method === "GET") {
        return handleGetStats(request, env);
      }
      if (path === "/api/admin/dashboard" && method === "GET") {
        return handleGetDashboard(request, env);
      }

      const teacherDetailMatch = path.match(/^\/api\/admin\/teachers\/(\d+)\/detail$/);
      if (teacherDetailMatch && method === "GET") {
        return handleTeacherDetail(request, env, parseInt(teacherDetailMatch[1]));
      }

      const teacherGroupsMatch = path.match(/^\/api\/admin\/teachers\/(\d+)\/groups$/);
      if (teacherGroupsMatch && method === "PUT") {
        return handleUpdateGroups(request, env, parseInt(teacherGroupsMatch[1]));
      }

      // ── Admin: lesson detail ──
      const adminLessonMatch = path.match(/^\/api\/admin\/lessons\/(\d+)$/);
      if (adminLessonMatch && method === "GET") {
        return handleAdminLessonDetail(request, env, parseInt(adminLessonMatch[1]));
      }

      // ── Admin: student detail + stats ──
      if (path === "/api/admin/students" && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleAdminStudents(admin, env);
      }
      const adminStudentMatch = path.match(/^\/api\/admin\/students\/(\d+)$/);
      if (adminStudentMatch && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleAdminStudentDetail(admin, env, parseInt(adminStudentMatch[1]));
      }

      const teacherIdMatch = path.match(/^\/api\/admin\/teachers\/(\d+)$/);
      if (teacherIdMatch && method === "PUT") {
        return handleUpdateTeacher(request, env, parseInt(teacherIdMatch[1]));
      }
      if (teacherIdMatch && method === "DELETE") {
        return handleDeleteTeacher(request, env, parseInt(teacherIdMatch[1]));
      }

      // ── Teacher: students ──
      if (path === "/api/teacher/students" && method === "GET") {
        const [user, uerr] = await requireUser(request, env);
        if (uerr) return uerr;
        return handleListStudents(user, env);
      }
      if (path === "/api/teacher/students" && method === "POST") {
        const [user, uerr] = await requireUser(request, env);
        if (uerr) return uerr;
        return handleCreateStudent(request, user, env);
      }
      const studentIdMatch = path.match(/^\/api\/teacher\/students\/(\d+)$/);
      if (studentIdMatch && method === "DELETE") {
        const [user, uerr] = await requireUser(request, env);
        if (uerr) return uerr;
        return handleDeleteStudent(user, env, parseInt(studentIdMatch[1]));
      }
      if (studentIdMatch && method === "PUT") {
        const [user, uerr] = await requireUser(request, env);
        if (uerr) return uerr;
        return handleUpdateStudent(request, user, env, parseInt(studentIdMatch[1]));
      }

      // ── Mentor (student) ──
      if (path === "/api/mentor/lessons" && method === "GET") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorLessons(student, env);
      }
      const mentorLessonMatch = path.match(/^\/api\/mentor\/lessons\/(\d+)$/);
      if (mentorLessonMatch && method === "GET") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorLesson(student, env, parseInt(mentorLessonMatch[1]));
      }
      const mentorTestMatch = path.match(/^\/api\/mentor\/lessons\/(\d+)\/test$/);
      if (mentorTestMatch && method === "GET") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorTest(student, env, parseInt(mentorTestMatch[1]));
      }
      if (mentorTestMatch && method === "POST") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorSubmitTest(request, student, env, parseInt(mentorTestMatch[1]));
      }
      const mentorChatMatch = path.match(/^\/api\/mentor\/lessons\/(\d+)\/chat$/);
      if (mentorChatMatch && method === "GET") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorChatHistory(student, env, parseInt(mentorChatMatch[1]));
      }
      if (mentorChatMatch && method === "POST") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorChatSend(request, student, env, parseInt(mentorChatMatch[1]));
      }

      // ── Mentor: lesson evaluation (questionnaire) ──
      if (path === "/api/mentor/evaluations/pending" && method === "GET") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorEvaluationPending(student, env);
      }
      const mentorEvalMatch = path.match(/^\/api\/mentor\/lessons\/(\d+)\/evaluation$/);
      if (mentorEvalMatch && method === "GET") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorEvaluationGet(student, env, parseInt(mentorEvalMatch[1]));
      }
      if (mentorEvalMatch && method === "POST") {
        const [student, serr] = await requireUser(request, env);
        if (serr) return serr;
        return handleMentorEvaluationSubmit(request, student, env, parseInt(mentorEvalMatch[1]));
      }

      // ── Institution ──
      if (path === "/api/admin/institution" && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleGetInstitution(admin, env);
      }
      if (path === "/api/admin/institution" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleCreateInstitution(request, admin, env);
      }
      if (path === "/api/admin/institution" && method === "PUT") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleUpdateInstitution(request, admin, env);
      }

      // ── Hierarchy nodes ──
      if (path === "/api/admin/hierarchy" && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleListHierarchy(request, admin, env);
      }
      if (path === "/api/admin/hierarchy" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleCreateHierarchy(request, admin, env);
      }
      const hierMatch = path.match(/^\/api\/admin\/hierarchy\/(\d+)$/);
      if (hierMatch && method === "PUT") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleUpdateHierarchy(request, admin, env, parseInt(hierMatch[1]));
      }
      if (hierMatch && method === "DELETE") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleDeleteHierarchy(admin, env, parseInt(hierMatch[1]));
      }

      // ── Subjects ──
      if (path === "/api/admin/subjects" && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleListSubjects(admin, env);
      }
      if (path === "/api/admin/subjects" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleCreateSubject(request, admin, env);
      }
      const subjMatch = path.match(/^\/api\/admin\/subjects\/(\d+)$/);
      if (subjMatch && method === "PUT") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleUpdateSubject(request, admin, env, parseInt(subjMatch[1]));
      }
      if (subjMatch && method === "DELETE") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleDeleteSubject(admin, env, parseInt(subjMatch[1]));
      }

      // ── Groups (v2) ──
      if (path === "/api/admin/groups" && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleListGroups(request, admin, env);
      }
      if (path === "/api/admin/groups" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleCreateGroup(request, admin, env);
      }
      const groupMatch = path.match(/^\/api\/admin\/groups\/(\d+)$/);
      if (groupMatch && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleGetGroup(admin, env, parseInt(groupMatch[1]));
      }
      if (groupMatch && method === "PUT") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleUpdateGroup(request, admin, env, parseInt(groupMatch[1]));
      }
      if (groupMatch && method === "DELETE") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleDeleteGroup(admin, env, parseInt(groupMatch[1]));
      }

      // ── Teacher assignments ──
      const tAssignMatch = path.match(/^\/api\/admin\/teachers\/(\d+)\/assignments$/);
      if (tAssignMatch && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleGetTeacherAssignments(admin, env, parseInt(tAssignMatch[1]));
      }
      if (tAssignMatch && method === "PUT") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleSetTeacherAssignments(request, admin, env, parseInt(tAssignMatch[1]));
      }

      // ── Student group membership ──
      const sGroupsMatch = path.match(/^\/api\/admin\/students\/(\d+)\/groups$/);
      if (sGroupsMatch && method === "PUT") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleSetStudentGroups(request, admin, env, parseInt(sGroupsMatch[1]));
      }

      // ── Admin: evaluation questions (CRUD + results) ──
      if (path === "/api/admin/evaluation-questions" && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleListEvalQuestions(admin, env);
      }
      if (path === "/api/admin/evaluation-questions" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleCreateEvalQuestion(request, admin, env);
      }
      const evalQMatch = path.match(/^\/api\/admin\/evaluation-questions\/(\d+)$/);
      if (evalQMatch && method === "PUT") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleUpdateEvalQuestion(request, admin, env, parseInt(evalQMatch[1]));
      }
      if (evalQMatch && method === "DELETE") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleDeleteEvalQuestion(admin, env, parseInt(evalQMatch[1]));
      }
      const evalResultsMatch = path.match(/^\/api\/admin\/evaluation-questions\/(\d+)\/results$/);
      if (evalResultsMatch && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleEvalQuestionResults(admin, env, parseInt(evalResultsMatch[1]));
      }

      // ── Admin: AI assistant (/ai-menu — savol → statistika → Gemini + TTS/STT) ──
      if (path === "/api/admin/ai/ask" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        const rl = await checkRateLimit(env.DB, `ai-ask:${admin.id}`, 20, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleAiAsk(request, admin, env);
      }
      if (path === "/api/admin/ai/tts" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        const rl = await checkRateLimit(env.DB, `ai-tts:${admin.id}`, 30, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleAiTts(request, env);
      }
      if (path === "/api/admin/ai/stt" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        const rl = await checkRateLimit(env.DB, `ai-stt:${admin.id}`, 20, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleAiStt(request, env);
      }

      // ── Admin: Gemini test (upload audio → STT → evaluate, no DB write) ──
      if (path === "/api/admin/gemini-test" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        // Each call hits Gemini twice (STT + evaluate) — keep it modest.
        const rl = await checkRateLimit(env.DB, `geminitest:${admin.id}`, 20, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleGeminiTest(request, env);
      }

      // ── Admin: HEMIS integration (status + one-way sync) ──
      if (path === "/api/admin/hemis/status" && method === "GET") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        return handleHemisStatus(admin, env);
      }
      if (path === "/api/admin/hemis/sync" && method === "POST") {
        const [admin, aerr] = await requireAdmin(request, env);
        if (aerr) return aerr;
        // Sync is expensive (many HEMIS subrequests + D1 writes) — keep it slow.
        const rl = await checkRateLimit(env.DB, `hemis-sync:${admin.id}`, 30, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
        return handleHemisSync(request, admin, env);
      }

      // ── WebSocket (Durable Object) ──
      if (path === "/ws/transcribe") {
        // Authenticate the WS upgrade. Prefer the Authorization header — the
        // ?token= query param is accepted as a fallback for clients that can't
        // set headers on upgrade, but URL params can leak into proxy access logs.
        const auth = request.headers.get("Authorization");
        const urlToken = url.searchParams.get("token");
        const token = auth?.startsWith("Bearer ") ? auth.slice(7) : urlToken;
        if (!token) return json({ detail: "Avtorizatsiya kerak" }, 401);
        const payload = await verifyJWT(token, env.JWT_SECRET);
        if (!payload?.sub || payload.type !== "access") {
          return json({ detail: "Yaroqsiz token" }, 401);
        }
        // Rate-limit WS upgrades by user_id (10 sessions / minute is plenty).
        const rl = await checkRateLimit(env.DB, `ws:${payload.sub}`, 10, 60);
        if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

        const sessionId = crypto.randomUUID();
        const id = env.RECORDING_SESSION.idFromName(sessionId);
        const stub = env.RECORDING_SESSION.get(id);

        // Forward request with authenticated user_id in a header the DO trusts.
        const forwardHeaders = new Headers(request.headers);
        forwardHeaders.set("X-User-Id", String(payload.sub));
        const forwardReq = new Request(request.url, {
          method: request.method,
          headers: forwardHeaders,
          body: request.body,
        });
        return stub.fetch(forwardReq);
      }

    return json({ detail: "Not found" }, 404);
  } catch (e: any) {
    // Log the real error server-side, but never leak internals (stack, SQL,
    // table names) to the client.
    console.error("Handler error:", e);
    return json({ detail: "Ichki xatolik yuz berdi" }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handleRequest(request, env);
    // WebSocket upgrade responses (101) cannot be wrapped — they carry the
    // webSocket pair and any rebuilt Response would lose it.
    if (response.status === 101) return response;
    return withCors(response, request);
  },
};

// ═══════════════════════════════════════════════════════
// Route implementations
// ═══════════════════════════════════════════════════════

const GEMINI_TEST_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
]);

/**
 * Admin "Gemini test" tool: upload a single audio file, transcribe it in one
 * shot, then evaluate the resulting transcript. Nothing is persisted — it's a
 * debugging harness for STT/evaluation quality, not a real lesson.
 *
 * Small files (≤14MB) go inline; larger ones are uploaded via the Gemini
 * Files API inside `transcribeAudioFile`. We cap raw uploads at 100MB to stay
 * within Worker memory.
 */
async function handleGeminiTest(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ detail: "Gemini API kaliti sozlanmagan" }, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ detail: "Audio fayl yuborilmadi (multipart/form-data kerak)" }, 400);
  }

  // workers-types may type FormData entries as string only, so cast structurally.
  type UploadedFile = { size: number; type: string; name: string; arrayBuffer(): Promise<ArrayBuffer> };
  const raw = form.get("audio") as unknown;
  if (!raw || typeof raw === "string" || typeof (raw as any).arrayBuffer !== "function") {
    return json({ detail: "Audio fayl topilmadi" }, 400);
  }
  const file = raw as UploadedFile;
  if (file.size === 0) return json({ detail: "Audio fayl bo'sh" }, 400);

  const MAX_BYTES = 100 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return json({
      detail: `Audio juda katta (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimum ~100MB.`,
    }, 413);
  }

  const courseType = String(form.get("course_type") || "").trim();
  const topic = String(form.get("topic") || "").trim();
  const durationMinutes = Math.max(1, Math.min(240, parseInt(String(form.get("duration_minutes") || ""), 10) || 10));
  const modelRaw = String(form.get("model") || "").trim();
  const modelOverride = GEMINI_TEST_MODELS.has(modelRaw) ? modelRaw : undefined;
  const mime = file.type || "audio/wav";

  const buf = new Uint8Array(await file.arrayBuffer());

  const t0 = Date.now();
  const { transcript, model } = await transcribeAudioFile(
    env.GEMINI_API_KEY, buf, mime, courseType, topic, modelOverride
  );
  const sttMs = Date.now() - t0;

  if (!transcript || transcript.trim().length < 5) {
    return json({
      transcript: "",
      transcript_chars: 0,
      evaluation: null,
      model: model || modelOverride || "",
      mime, size_bytes: file.size, duration_minutes: durationMinutes,
      stt_ms: sttMs, eval_ms: 0,
      warning: "Transkripsiya bo'sh qaytdi — audio sifati past, juda jim, yoki formatni Gemini qo'llab-quvvatlamadi.",
    });
  }

  const t1 = Date.now();
  const evaluation = await evaluateLesson(env.GEMINI_API_KEY, transcript, courseType, topic, durationMinutes);
  const evalMs = Date.now() - t1;

  return json({
    transcript,
    transcript_chars: transcript.length,
    evaluation,
    model: model || modelOverride || "",
    mime, size_bytes: file.size, duration_minutes: durationMinutes,
    stt_ms: sttMs, eval_ms: evalMs,
  });
}

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

// ── HEMIS integration handlers ──

const HEMIS_SYNC_SCOPES = new Set<SyncScope>([
  "departments", "specialties", "subjects", "groups",
  "teachers", "students", "assignments", "courses", "structure",
]);

/** Verify a HEMIS SSO token and log the student into eyeziyo. */
async function handleHemisSso(request: Request, env: Env): Promise<Response> {
  if (!ssoConfigured(env)) return json({ detail: "HEMIS SSO sozlanmagan" }, 503);
  let token: unknown;
  try {
    ({ token } = (await request.json()) as any);
  } catch {
    return json({ detail: "Noto'g'ri so'rov" }, 400);
  }
  if (typeof token !== "string" || !token.trim()) {
    return json({ detail: "SSO token kerak" }, 400);
  }
  try {
    const user = await resolveSsoUser(env, token.trim());
    const tokens = await issueTokens(env, user);
    return json(tokens);
  } catch (e: any) {
    if (e instanceof HemisError) return json({ detail: e.message }, e.status);
    console.error("HEMIS SSO error:", e);
    return json({ detail: "SSO kirishda xatolik" }, 500);
  }
}

/** Report HEMIS config presence + per-entity sync state for the admin's institution. */
async function handleHemisStatus(admin: any, env: Env): Promise<Response> {
  const instId = admin.institution_id;
  const inst = instId
    ? await env.DB.prepare("SELECT id, name, type, hemis_synced_at FROM institutions WHERE id = ?").bind(instId).first<any>()
    : null;
  const state = instId
    ? (await env.DB.prepare(
        "SELECT entity, last_page, total_count, synced_at FROM hemis_sync_state WHERE institution_id = ?"
      ).bind(instId).all()).results
    : [];
  return json({
    configured: hemisConfigured(env),
    sso_configured: ssoConfigured(env),
    base_url: env.HEMIS_BASE_URL || "https://student.atmu.uz/rest",
    institution: inst,
    sync_state: state,
  });
}

/**
 * Trigger a HEMIS -> eyeziyo sync step. Body: { scope, page? }.
 * Small scopes (or `structure`) complete in one call; `students`/`assignments`
 * process one page and return `done`/`page_count` so the client can loop.
 */
async function handleHemisSync(request: Request, admin: any, env: Env): Promise<Response> {
  if (!hemisConfigured(env)) return json({ detail: "HEMIS_API_TOKEN sozlanmagan" }, 503);
  if (!admin.institution_id) return json({ detail: "Muassasa sozlanmagan", code: "NO_INSTITUTION" }, 409);

  let scope: unknown, page: unknown;
  try {
    ({ scope, page } = (await request.json()) as any);
  } catch {
    return json({ detail: "Noto'g'ri so'rov" }, 400);
  }
  if (typeof scope !== "string" || !HEMIS_SYNC_SCOPES.has(scope as SyncScope)) {
    return json({ detail: "Noto'g'ri scope" }, 400);
  }
  const pageNum = Math.max(1, parseInt(String(page ?? 1), 10) || 1);

  try {
    const results = await runSync(env as any, admin.institution_id, scope as SyncScope, pageNum);
    if (scope !== "students" && scope !== "assignments") {
      await env.DB.prepare("UPDATE institutions SET hemis_synced_at = ? WHERE id = ?")
        .bind(Math.floor(Date.now() / 1000), admin.institution_id).run();
    }
    return json({ scope, results });
  } catch (e: any) {
    if (e instanceof HemisError) return json({ detail: e.message }, e.status);
    console.error("HEMIS sync error:", e);
    return json({ detail: e?.message || "Sinxronlashda xatolik" }, 500);
  }
}

async function handleGetLessons(request: Request, env: Env): Promise<Response> {
  const [user, err] = await requireUser(request, env);
  if (err) return err;

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50;

  const lessons = await env.DB.prepare(`
    SELECT l.*, e.overall_score, e.topic_score, e.speech_score, e.method_score,
           e.interaction_score, e.feedback_score,
           e.summary, e.strengths, e.improvements, e.advice
    FROM lessons l LEFT JOIN evaluations e ON l.id = e.lesson_id
    WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT ?
  `).bind(user.id, limit).all();

  return json(lessons.results.map((r: any) => ({
    id: r.id, user_id: r.user_id, group_name: r.group_name, topic: r.topic,
    course_type: r.course_type, duration_seconds: r.duration_seconds,
    transcript: r.transcript, created_at: r.created_at,
    evaluation: r.overall_score != null ? {
      id: 0, lesson_id: r.id,
      overall_score: r.overall_score, topic_score: r.topic_score,
      speech_score: r.speech_score, method_score: r.method_score,
      interaction_score: r.interaction_score, feedback_score: r.feedback_score,
      summary: r.summary, strengths: JSON.parse(r.strengths || "[]"),
      improvements: JSON.parse(r.improvements || "[]"), advice: JSON.parse(r.advice || "[]"),
    } : null,
  })));
}

async function handleCreateLesson(request: Request, env: Env): Promise<Response> {
  const [user, err] = await requireUser(request, env);
  if (err) return err;

  const { group_name, topic, course_type } = (await request.json()) as any;
  const result = await env.DB.prepare(
    "INSERT INTO lessons (user_id, group_name, topic, course_type) VALUES (?, ?, ?, ?)"
  ).bind(user.id, group_name || "", topic || "", course_type || user.course_type || "").run();

  const lesson = await env.DB.prepare("SELECT * FROM lessons WHERE rowid = ?").bind(result.meta.last_row_id).first();
  return json({
    id: lesson!.id, user_id: lesson!.user_id, group_name: lesson!.group_name,
    topic: lesson!.topic, course_type: lesson!.course_type,
    duration_seconds: lesson!.duration_seconds, transcript: lesson!.transcript,
    created_at: lesson!.created_at, evaluation: null,
  }, 201);
}

async function handleGetLesson(request: Request, env: Env, lessonId: number): Promise<Response> {
  const [user, err] = await requireUser(request, env);
  if (err) return err;

  const lesson = await env.DB.prepare("SELECT * FROM lessons WHERE id = ?").bind(lessonId).first();
  if (!lesson) return json({ detail: "Dars topilmadi" }, 404);
  if (lesson.user_id !== user.id) {
    // Admins may read lessons, but only within their own institution.
    if (user.role !== "admin") return json({ detail: "Ruxsat yo'q" }, 403);
    const owner = await env.DB.prepare("SELECT institution_id FROM users WHERE id = ?")
      .bind(lesson.user_id).first<{ institution_id: number | null }>();
    if (!owner || owner.institution_id !== user.institution_id) {
      return json({ detail: "Ruxsat yo'q" }, 403);
    }
  }

  const evaluation = await env.DB.prepare("SELECT * FROM evaluations WHERE lesson_id = ?").bind(lessonId).first();

  return json({
    id: lesson.id, user_id: lesson.user_id, group_name: lesson.group_name,
    topic: lesson.topic, course_type: lesson.course_type,
    duration_seconds: lesson.duration_seconds, transcript: lesson.transcript,
    created_at: lesson.created_at,
    evaluation: evaluation ? {
      ...evaluation,
      strengths: JSON.parse((evaluation.strengths || "[]") as string),
      improvements: JSON.parse((evaluation.improvements || "[]") as string),
      advice: JSON.parse((evaluation.advice || "[]") as string),
    } : null,
  });
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
