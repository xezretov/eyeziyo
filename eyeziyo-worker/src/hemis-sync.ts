/**
 * HEMIS -> eyeziyo one-way sync.
 *
 * Populates the admin panel's structural tables (hierarchy_nodes, subjects,
 * groups_v2, users) and the teacher/student assignment tables from the HEMIS
 * Backend API. HEMIS is the master; every synced row is matched back to its
 * HEMIS id via the `hemis_id` columns (see migration 0010).
 *
 * Only meaningful for `university`-type institutions — the Backend API models
 * an OTM (faculty -> specialty -> group). Lessons/evaluations are never synced;
 * they remain eyeziyo's own data.
 *
 * Sync order respects FK-ish dependencies:
 *   departments -> specialties -> subjects -> groups -> teachers
 *   -> students(+group membership) -> assignments(teacher<->subject<->group)
 *
 * Small collections are fetched in full; students and assignments are large so
 * they're driven one page at a time (the caller loops with `?page=`).
 */

import {
  HemisEnv, hemisFetchAll, hemisFetchPage,
  HemisDepartment, HemisSpecialty, HemisSubject, HemisGroup,
  HemisEmployee, HemisStudent, HemisCurriculumSubjectTeacher,
} from "./hemis-client";

export interface SyncEnv extends HemisEnv {
  DB: D1Database;
}

// Employees/students authenticate via HEMIS SSO, never a password. This sentinel
// hash matches neither the pbkdf2 nor the legacy SHA-256 format, so
// verifyPassword() always rejects it — password login is impossible for them.
const SSO_ONLY_PASSWORD = "hemis-sso-only";

// HEMIS department.structureType.code for an academic faculty ("Fakultet").
const FACULTY_STRUCTURE_CODE = "11";

export interface SyncResult {
  entity: string;
  total: number;
  inserted: number;
  updated: number;
  page?: number;
  page_count?: number;
  done: boolean;
}

async function idMap(
  db: D1Database, sql: string, ...binds: any[]
): Promise<Map<number, number>> {
  const rows = await db.prepare(sql).bind(...binds).all<{ hemis_id: number; id: number }>();
  const m = new Map<number, number>();
  for (const r of rows.results || []) {
    if (r.hemis_id != null) m.set(Number(r.hemis_id), Number(r.id));
  }
  return m;
}

async function getInstitutionType(db: D1Database, instId: number): Promise<string | null> {
  const row = await db.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first<{ type: string }>();
  return row?.type ?? null;
}

async function recordState(
  db: D1Database, instId: number, entity: string,
  r: { total: number; page?: number }
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `INSERT INTO hemis_sync_state (institution_id, entity, last_page, total_count, synced_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(institution_id, entity) DO UPDATE SET
       last_page = excluded.last_page,
       total_count = excluded.total_count,
       synced_at = excluded.synced_at`
  ).bind(instId, entity, r.page ?? 0, r.total, now).run();
}

// ── departments -> faculty nodes ──
export async function syncDepartments(env: SyncEnv, instId: number): Promise<SyncResult> {
  const all = await hemisFetchAll<HemisDepartment>(env, "v1/data/department-list", { active: "all" });
  const faculties = all.filter((d) => d.structureType?.code === FACULTY_STRUCTURE_CODE);
  const existing = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM hierarchy_nodes WHERE institution_id = ? AND node_type = 'faculty' AND hemis_id IS NOT NULL",
    instId
  );
  let inserted = 0, updated = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const d of faculties) {
    const rowId = existing.get(d.id);
    if (rowId) {
      stmts.push(env.DB.prepare(
        "UPDATE hierarchy_nodes SET name = ?, short_name = ? WHERE id = ?"
      ).bind(d.name, d.code || "", rowId));
      updated++;
    } else {
      stmts.push(env.DB.prepare(
        `INSERT INTO hierarchy_nodes (institution_id, parent_id, node_type, name, short_name, hemis_id)
         VALUES (?, NULL, 'faculty', ?, ?, ?)`
      ).bind(instId, d.name, d.code || "", d.id));
      inserted++;
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  const res: SyncResult = { entity: "departments", total: faculties.length, inserted, updated, done: true };
  await recordState(env.DB, instId, "departments", { total: faculties.length });
  return res;
}

// ── specialties -> direction nodes (parent = faculty node) ──
export async function syncSpecialties(env: SyncEnv, instId: number): Promise<SyncResult> {
  const all = await hemisFetchAll<HemisSpecialty>(env, "v1/data/specialty-list");
  const facultyMap = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM hierarchy_nodes WHERE institution_id = ? AND node_type = 'faculty' AND hemis_id IS NOT NULL",
    instId
  );
  const existing = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM hierarchy_nodes WHERE institution_id = ? AND node_type = 'direction' AND hemis_id IS NOT NULL",
    instId
  );
  let inserted = 0, updated = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const s of all) {
    const parentId = s.department?.id ? facultyMap.get(s.department.id) ?? null : null;
    const rowId = existing.get(s.id);
    if (rowId) {
      stmts.push(env.DB.prepare(
        "UPDATE hierarchy_nodes SET name = ?, short_name = ?, parent_id = ? WHERE id = ?"
      ).bind(s.name, s.code || "", parentId, rowId));
      updated++;
    } else {
      stmts.push(env.DB.prepare(
        `INSERT INTO hierarchy_nodes (institution_id, parent_id, node_type, name, short_name, hemis_id)
         VALUES (?, ?, 'direction', ?, ?, ?)`
      ).bind(instId, parentId, s.name, s.code || "", s.id));
      inserted++;
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await recordState(env.DB, instId, "specialties", { total: all.length });
  return { entity: "specialties", total: all.length, inserted, updated, done: true };
}

// ── subjects ──
export async function syncSubjects(env: SyncEnv, instId: number): Promise<SyncResult> {
  const all = await hemisFetchAll<HemisSubject>(env, "v1/data/subject-meta-list");
  const existing = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM subjects WHERE institution_id = ? AND hemis_id IS NOT NULL",
    instId
  );
  let inserted = 0, updated = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const s of all) {
    const rowId = existing.get(s.id);
    if (rowId) {
      stmts.push(env.DB.prepare(
        "UPDATE subjects SET name = ?, short_name = ? WHERE id = ?"
      ).bind(s.name, s.code || "", rowId));
      updated++;
    } else {
      stmts.push(env.DB.prepare(
        `INSERT INTO subjects (institution_id, type, name, short_name, hemis_id)
         VALUES (?, 'university', ?, ?, ?)`
      ).bind(instId, s.name, s.code || "", s.id));
      inserted++;
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await recordState(env.DB, instId, "subjects", { total: all.length });
  return { entity: "subjects", total: all.length, inserted, updated, done: true };
}

// ── groups (parent = direction node) ──
export async function syncGroups(env: SyncEnv, instId: number): Promise<SyncResult> {
  const all = await hemisFetchAll<HemisGroup>(env, "v1/data/group-list");
  const directionMap = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM hierarchy_nodes WHERE institution_id = ? AND node_type = 'direction' AND hemis_id IS NOT NULL",
    instId
  );
  const existing = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM groups_v2 WHERE institution_id = ? AND hemis_id IS NOT NULL",
    instId
  );
  let inserted = 0, updated = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const g of all) {
    const parentNodeId = g.specialty?.id ? directionMap.get(g.specialty.id) ?? null : null;
    const rowId = existing.get(g.id);
    if (rowId) {
      stmts.push(env.DB.prepare(
        "UPDATE groups_v2 SET name = ?, parent_node_id = ? WHERE id = ?"
      ).bind(g.name, parentNodeId, rowId));
      updated++;
    } else {
      stmts.push(env.DB.prepare(
        `INSERT INTO groups_v2 (institution_id, parent_node_id, name, hemis_id)
         VALUES (?, ?, ?, ?)`
      ).bind(instId, parentNodeId, g.name, g.id));
      inserted++;
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await recordState(env.DB, instId, "groups", { total: all.length });
  return { entity: "groups", total: all.length, inserted, updated, done: true };
}

// ── teachers (HEMIS employees, type=teacher) ──
export async function syncTeachers(env: SyncEnv, instId: number): Promise<SyncResult> {
  const all = await hemisFetchAll<HemisEmployee>(env, "v1/data/employee-list", { type: "teacher" });
  const existing = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM users WHERE institution_id = ? AND role = 'teacher' AND hemis_id IS NOT NULL",
    instId
  );
  let inserted = 0, updated = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const e of all) {
    const name = e.full_name || e.short_name || `Employee ${e.id}`;
    const avatar = (name.trim().charAt(0) || "?").toUpperCase();
    const email = `emp-${e.employee_id_number || e.id}@hemis.local`;
    const rowId = existing.get(e.id);
    if (rowId) {
      stmts.push(env.DB.prepare(
        "UPDATE users SET name = ?, avatar = ? WHERE id = ?"
      ).bind(name, avatar, rowId));
      updated++;
    } else {
      stmts.push(env.DB.prepare(
        `INSERT OR IGNORE INTO users (email, password_hash, name, role, avatar, groups, course_type, institution_id, type, hemis_id)
         VALUES (?, ?, ?, 'teacher', ?, '[]', '', ?, 'university', ?)`
      ).bind(email, SSO_ONLY_PASSWORD, name, avatar, instId, e.id));
      inserted++;
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await recordState(env.DB, instId, "teachers", { total: all.length });
  return { entity: "teachers", total: all.length, inserted, updated, done: true };
}

// ── students (one page per call) + group membership ──
export async function syncStudents(env: SyncEnv, instId: number, page: number): Promise<SyncResult> {
  const pg = await hemisFetchPage<HemisStudent>(env, "v1/data/student-list", {}, page);
  const existing = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM users WHERE institution_id = ? AND role = 'student' AND hemis_id IS NOT NULL",
    instId
  );
  const groupMap = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM groups_v2 WHERE institution_id = ? AND hemis_id IS NOT NULL",
    instId
  );
  let inserted = 0, updated = 0;
  const stmts: D1PreparedStatement[] = [];
  const membership: Array<{ hemisStudentId: number; groupRowId: number }> = [];
  for (const s of pg.items) {
    const name = s.full_name || s.short_name || `Student ${s.id}`;
    const avatar = (name.trim().charAt(0) || "?").toUpperCase();
    const email = `stu-${s.student_id_number || s.id}@hemis.local`;
    const rowId = existing.get(s.id);
    if (rowId) {
      stmts.push(env.DB.prepare(
        "UPDATE users SET name = ?, avatar = ? WHERE id = ?"
      ).bind(name, avatar, rowId));
      updated++;
    } else {
      stmts.push(env.DB.prepare(
        `INSERT OR IGNORE INTO users (email, password_hash, name, role, avatar, groups, course_type, institution_id, type, hemis_id)
         VALUES (?, ?, ?, 'student', ?, '[]', '', ?, 'university', ?)`
      ).bind(email, SSO_ONLY_PASSWORD, name, avatar, instId, s.id));
      inserted++;
    }
    const groupRowId = s.group?.id ? groupMap.get(s.group.id) : undefined;
    if (groupRowId) membership.push({ hemisStudentId: s.id, groupRowId });
  }
  if (stmts.length) await env.DB.batch(stmts);

  // Resolve student user ids (existing + freshly inserted) then link memberships.
  if (membership.length) {
    const freshMap = await idMap(
      env.DB,
      "SELECT id, hemis_id FROM users WHERE institution_id = ? AND role = 'student' AND hemis_id IS NOT NULL",
      instId
    );
    const linkStmts: D1PreparedStatement[] = [];
    for (const m of membership) {
      const studentRowId = freshMap.get(m.hemisStudentId);
      if (!studentRowId) continue;
      linkStmts.push(env.DB.prepare(
        "INSERT OR IGNORE INTO student_groups (student_id, group_id) VALUES (?, ?)"
      ).bind(studentRowId, m.groupRowId));
    }
    if (linkStmts.length) await env.DB.batch(linkStmts);
  }

  const done = page >= pg.pageCount;
  await recordState(env.DB, instId, "students", { total: pg.totalCount, page });
  return {
    entity: "students", total: pg.totalCount, inserted, updated,
    page, page_count: pg.pageCount, done,
  };
}

// ── assignments: curriculum-subject-teacher -> teacher_subjects + teacher_groups ──
export async function syncAssignments(env: SyncEnv, instId: number, page: number): Promise<SyncResult> {
  const pg = await hemisFetchPage<HemisCurriculumSubjectTeacher>(
    env, "v1/data/curriculum-subject-teacher-list", {}, page
  );
  const teacherMap = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM users WHERE institution_id = ? AND role = 'teacher' AND hemis_id IS NOT NULL",
    instId
  );
  const subjectMap = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM subjects WHERE institution_id = ? AND hemis_id IS NOT NULL",
    instId
  );
  const groupMap = await idMap(
    env.DB,
    "SELECT id, hemis_id FROM groups_v2 WHERE institution_id = ? AND hemis_id IS NOT NULL",
    instId
  );
  let inserted = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const cst of pg.items) {
    const teacherId = cst.employee?.id ? teacherMap.get(cst.employee.id) : undefined;
    const subjectId = cst.subject?.id ? subjectMap.get(cst.subject.id) : undefined;
    const groupId = cst._group ? groupMap.get(cst._group) : undefined;
    if (!teacherId) continue;
    if (subjectId) {
      stmts.push(env.DB.prepare(
        "INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)"
      ).bind(teacherId, subjectId));
      inserted++;
    }
    if (groupId) {
      stmts.push(env.DB.prepare(
        "INSERT OR IGNORE INTO teacher_groups (teacher_id, group_id, subject_id) VALUES (?, ?, ?)"
      ).bind(teacherId, groupId, subjectId ?? null));
      inserted++;
    }
  }
  if (stmts.length) await env.DB.batch(stmts);

  const done = page >= pg.pageCount;
  await recordState(env.DB, instId, "assignments", { total: pg.totalCount, page });
  return {
    entity: "assignments", total: pg.totalCount, inserted, updated: 0,
    page, page_count: pg.pageCount, done,
  };
}

export type SyncScope =
  | "departments" | "specialties" | "subjects" | "groups"
  | "teachers" | "students" | "assignments" | "structure";

/**
 * Run one sync step. `structure` chains the small collections in one call
 * (departments -> specialties -> subjects -> groups -> teachers). The large,
 * paginated scopes (`students`, `assignments`) process a single `page` and
 * report `done`/`page_count` so the caller can loop.
 */
export async function runSync(
  env: SyncEnv, instId: number, scope: SyncScope, page = 1
): Promise<SyncResult[]> {
  const instType = await getInstitutionType(env.DB, instId);
  if (instType !== "university") {
    throw new Error("HEMIS sinxroni faqat 'university' turidagi muassasa uchun ishlaydi");
  }
  switch (scope) {
    case "departments": return [await syncDepartments(env, instId)];
    case "specialties": return [await syncSpecialties(env, instId)];
    case "subjects":    return [await syncSubjects(env, instId)];
    case "groups":      return [await syncGroups(env, instId)];
    case "teachers":    return [await syncTeachers(env, instId)];
    case "students":    return [await syncStudents(env, instId, page)];
    case "assignments": return [await syncAssignments(env, instId, page)];
    case "structure":
      return [
        await syncDepartments(env, instId),
        await syncSpecialties(env, instId),
        await syncSubjects(env, instId),
        await syncGroups(env, instId),
        await syncTeachers(env, instId),
      ];
    default:
      throw new Error("Noma'lum sync scope");
  }
}
