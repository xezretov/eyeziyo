/**
 * HEMIS SSO login.
 *
 * Flow: the student authenticates on the HEMIS student portal, HEMIS redirects
 * them to eyeziyo's registered return URL (admin.eyeziyo.uz) with a one-time
 * `sso_token`. The frontend posts that token here; we verify it against HEMIS
 * (`/v1/sso/verify` with our shared secret), then find-or-create the matching
 * eyeziyo student and hand back a normal eyeziyo session (issued by the caller).
 *
 * Matching priority: hemis_id (== HEMIS student_id) -> pinfl -> synthetic email.
 * SSO-provisioned users get an unusable password hash, so they can only ever
 * log in through HEMIS.
 */

import { HemisEnv, hemisVerifySso, HemisSsoStudent } from "./hemis-client";

interface SsoEnv extends HemisEnv {
  DB: D1Database;
}

const SSO_ONLY_PASSWORD = "hemis-sso-only";

/**
 * Resolve which eyeziyo institution an SSO student belongs to:
 *   1. institution whose hemis_university_code matches, else
 *   2. the sole institution if exactly one exists, else
 *   3. null (unattached — admin completes onboarding later).
 */
async function resolveInstitutionId(db: D1Database, universityCode?: string): Promise<number | null> {
  if (universityCode) {
    const byCode = await db.prepare(
      "SELECT id FROM institutions WHERE hemis_university_code = ? LIMIT 1"
    ).bind(universityCode).first<{ id: number }>();
    if (byCode?.id) return byCode.id;
  }
  const all = await db.prepare("SELECT id FROM institutions LIMIT 2").all<{ id: number }>();
  const rows = all.results || [];
  return rows.length === 1 ? Number(rows[0].id) : null;
}

function fullName(s: HemisSsoStudent): string {
  return [s.second_name, s.first_name, s.third_name].filter(Boolean).join(" ").trim()
    || `Student ${s.student_id}`;
}

/**
 * Verify an SSO token and return the corresponding eyeziyo student user row,
 * creating it if this is their first login.
 */
export async function resolveSsoUser(env: SsoEnv, token: string): Promise<any> {
  const student = await hemisVerifySso(env, token);
  const name = fullName(student);
  const avatar = (name.charAt(0) || "?").toUpperCase();

  // 1. Match an already-synced/known student by HEMIS id, then PINFL.
  let user = await env.DB.prepare(
    "SELECT * FROM users WHERE role = 'student' AND hemis_id = ? LIMIT 1"
  ).bind(student.student_id).first<any>();

  if (!user && student.pinfl) {
    user = await env.DB.prepare(
      "SELECT * FROM users WHERE pinfl = ? LIMIT 1"
    ).bind(student.pinfl).first<any>();
  }

  if (user) {
    // Keep identity fields fresh (backfill hemis_id/pinfl for pre-synced rows).
    await env.DB.prepare(
      "UPDATE users SET name = ?, avatar = ?, hemis_id = ?, pinfl = ? WHERE id = ?"
    ).bind(name, avatar, student.student_id, student.pinfl, user.id).run();
    return await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first<any>();
  }

  // 2. First login — provision a new student.
  const institutionId = await resolveInstitutionId(env.DB, student.university_code);
  const email = `stu-${student.student_id_number || student.student_id}@hemis.local`;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (email, password_hash, name, role, avatar, groups, course_type, institution_id, type, hemis_id, pinfl)
     VALUES (?, ?, ?, 'student', ?, '[]', '', ?, 'university', ?, ?)`
  ).bind(email, SSO_ONLY_PASSWORD, name, avatar, institutionId, student.student_id, student.pinfl).run();

  const created = await env.DB.prepare(
    "SELECT * FROM users WHERE email = ? LIMIT 1"
  ).bind(email).first<any>();
  if (!created) throw new Error("SSO foydalanuvchisini yaratib bo'lmadi");
  return created;
}
