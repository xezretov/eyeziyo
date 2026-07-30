/**
 * Admin core — institution, hierarchy, subjects, groups, assignments.
 * Single institution per admin (multi-tenant via institution_id).
 */

export interface Env {
  DB: D1Database;
}

function json(data: any, status = 200): Response {
  // CORS headers are added by the top-level worker (see index.ts withCors).
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getInstitutionId(admin: any): number | null {
  const v = admin.institution_id;
  return typeof v === "number" ? v : null;
}

async function requireInstitution(admin: any): Promise<[number, null] | [null, Response]> {
  const id = getInstitutionId(admin);
  if (!id) return [null, json({ detail: "Institution not set up", code: "NO_INSTITUTION" }, 409)];
  return [id, null];
}

// ═══════════════════════════════════════════════════════════════
// INSTITUTION
// ═══════════════════════════════════════════════════════════════

export async function handleGetInstitution(admin: any, env: Env): Promise<Response> {
  const id = getInstitutionId(admin);
  if (!id) return json(null);
  const inst = await env.DB.prepare("SELECT * FROM institutions WHERE id = ?").bind(id).first();
  if (!inst) return json(null);
  return json(inst);
}

export async function handleCreateInstitution(request: Request, admin: any, env: Env): Promise<Response> {
  const existing = getInstitutionId(admin);
  if (existing) return json({ detail: "Institution already set" }, 409);

  const b = (await request.json()) as any;
  if (!b.name || !b.type) return json({ detail: "name va type kerak" }, 400);
  if (!["university", "school", "center"].includes(b.type)) return json({ detail: "Noto'g'ri tur" }, 400);

  const r = await env.DB.prepare(
    `INSERT INTO institutions (name, short_name, type, logo_url, address, phone, email, academic_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    b.name.trim(),
    (b.short_name || "").trim(),
    b.type,
    (b.logo_url || "").trim(),
    (b.address || "").trim(),
    (b.phone || "").trim(),
    (b.email || "").trim(),
    (b.academic_year || "").trim()
  ).run();

  const instId = Number(r.meta.last_row_id);
  // Attach all existing unattached users to this institution (one-time onboarding).
  await env.DB.prepare("UPDATE users SET institution_id = ? WHERE institution_id IS NULL").bind(instId).run();

  const inst = await env.DB.prepare("SELECT * FROM institutions WHERE id = ?").bind(instId).first();
  return json(inst, 201);
}

export async function handleUpdateInstitution(request: Request, admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const b = (await request.json()) as any;
  const fields: string[] = [];
  const values: any[] = [];
  for (const k of ["name", "short_name", "logo_url", "address", "phone", "email", "academic_year", "type"]) {
    if (typeof b[k] === "string") {
      if (k === "type" && !["university", "school", "center"].includes(b[k])) continue;
      fields.push(`${k} = ?`);
      values.push(b[k].trim());
    }
  }
  if (fields.length === 0) return json({ detail: "O'zgartirish yo'q" }, 400);
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(instId);
  await env.DB.prepare(`UPDATE institutions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const inst = await env.DB.prepare("SELECT * FROM institutions WHERE id = ?").bind(instId).first();
  return json(inst);
}

// ═══════════════════════════════════════════════════════════════
// HIERARCHY NODES (faculty / department / course / parallel / class_letter / direction / level)
// ═══════════════════════════════════════════════════════════════

const VALID_NODE_TYPES = ["faculty", "department", "course", "parallel", "class_letter", "direction", "level"];

const TYPE_NODE_MAP: Record<string, string[]> = {
  university: ["faculty", "direction", "course"],
  school: ["parallel", "class_letter"],
  center: ["direction", "level"],
};

async function getInstitutionType(instId: number, env: Env): Promise<string | null> {
  const row = await env.DB.prepare("SELECT type FROM institutions WHERE id = ?").bind(instId).first();
  return (row?.type as string) || null;
}

async function getAllowedNodeTypes(instId: number, env: Env): Promise<string[]> {
  const t = await getInstitutionType(instId, env);
  return (t && TYPE_NODE_MAP[t]) || VALID_NODE_TYPES;
}

export async function handleListHierarchy(request: Request, admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const url = new URL(request.url);
  const nodeType = url.searchParams.get("type");
  const parentId = url.searchParams.get("parent_id");

  const allowedTypes = await getAllowedNodeTypes(instId, env);
  const allowedPh = allowedTypes.map(() => "?").join(",");

  let query = `
    SELECT h.*,
      (SELECT COUNT(*) FROM hierarchy_nodes c WHERE c.parent_id = h.id) as child_count,
      (SELECT COUNT(*) FROM groups_v2 g WHERE g.parent_node_id = h.id) as direct_group_count
    FROM hierarchy_nodes h
    WHERE h.institution_id = ? AND h.node_type IN (${allowedPh})
  `;
  const binds: any[] = [instId, ...allowedTypes];
  if (nodeType) { query += " AND h.node_type = ?"; binds.push(nodeType); }
  if (parentId === "null") query += " AND h.parent_id IS NULL";
  else if (parentId) { query += " AND h.parent_id = ?"; binds.push(parseInt(parentId)); }
  query += " ORDER BY h.sort_order, h.name";

  const rows = await env.DB.prepare(query).bind(...binds).all();

  // Compute transitive group + student counts (walk descendants for each node)
  const allNodes = await env.DB.prepare(
    `SELECT id, parent_id FROM hierarchy_nodes WHERE institution_id = ? AND node_type IN (${allowedPh})`
  ).bind(instId, ...allowedTypes).all();
  const childrenMap: Record<number, number[]> = {};
  for (const n of allNodes.results as any[]) {
    const pid = n.parent_id as number | null;
    if (pid) {
      if (!childrenMap[pid]) childrenMap[pid] = [];
      childrenMap[pid].push(n.id);
    }
  }
  const descendantIds = (nodeId: number): number[] => {
    const result: number[] = [nodeId];
    const stack = [...(childrenMap[nodeId] || [])];
    while (stack.length) {
      const next = stack.pop()!;
      result.push(next);
      for (const c of childrenMap[next] || []) stack.push(c);
    }
    return result;
  };

  // Per-node direct counts computed with 3 set-based GROUP BY queries (instead of
  // 3 queries per row) so large institutions don't fan out into hundreds of
  // sequential D1 calls. Transitive totals are rolled up over descendants in JS.
  const groupByNode: Record<number, number> = {};
  const studentByNode: Record<number, number> = {};
  const teacherByNode: Record<number, number> = {};

  const gAgg = await env.DB.prepare(
    `SELECT parent_node_id AS nid, COUNT(*) AS c
     FROM groups_v2
     WHERE institution_id = ? AND parent_node_id IS NOT NULL
     GROUP BY parent_node_id`
  ).bind(instId).all();
  for (const r of gAgg.results as any[]) groupByNode[r.nid as number] = Number(r.c || 0);

  const sAgg = await env.DB.prepare(
    `SELECT g.parent_node_id AS nid, COUNT(DISTINCT sg.student_id) AS c
     FROM student_groups sg
     JOIN groups_v2 g ON sg.group_id = g.id
     WHERE g.institution_id = ? AND g.parent_node_id IS NOT NULL
     GROUP BY g.parent_node_id`
  ).bind(instId).all();
  for (const r of sAgg.results as any[]) studentByNode[r.nid as number] = Number(r.c || 0);

  const tAgg = await env.DB.prepare(
    `SELECT g.parent_node_id AS nid, COUNT(DISTINCT tg.teacher_id) AS c
     FROM teacher_groups tg
     JOIN groups_v2 g ON tg.group_id = g.id
     WHERE g.institution_id = ? AND g.parent_node_id IS NOT NULL
     GROUP BY g.parent_node_id`
  ).bind(instId).all();
  for (const r of tAgg.results as any[]) teacherByNode[r.nid as number] = Number(r.c || 0);

  const enriched = [];
  for (const r of rows.results as any[]) {
    let groupCount = 0;
    let studentCount = 0;
    let teacherCount = 0;
    for (const id of descendantIds(r.id)) {
      groupCount += groupByNode[id] || 0;
      studentCount += studentByNode[id] || 0;
      teacherCount += teacherByNode[id] || 0;
    }
    enriched.push({
      ...r,
      meta: safeJson(r.meta, {}),
      group_count: groupCount,
      student_count: studentCount,
      teacher_count: teacherCount,
    });
  }

  return json(enriched);
}

export async function handleCreateHierarchy(request: Request, admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const b = (await request.json()) as any;
  if (!b.name || !b.node_type) return json({ detail: "name va node_type kerak" }, 400);
  if (!VALID_NODE_TYPES.includes(b.node_type)) return json({ detail: "Noto'g'ri node_type" }, 400);

  // Validate parent belongs to same institution
  if (b.parent_id) {
    const parent = await env.DB.prepare("SELECT institution_id FROM hierarchy_nodes WHERE id = ?")
      .bind(b.parent_id).first();
    if (!parent || parent.institution_id !== instId) return json({ detail: "Parent topilmadi" }, 400);
  }

  const r = await env.DB.prepare(
    `INSERT INTO hierarchy_nodes (institution_id, parent_id, node_type, name, short_name, sort_order, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    instId,
    b.parent_id || null,
    b.node_type,
    b.name.trim(),
    (b.short_name || "").trim(),
    b.sort_order || 0,
    JSON.stringify(b.meta || {})
  ).run();

  const node = await env.DB.prepare("SELECT * FROM hierarchy_nodes WHERE id = ?")
    .bind(r.meta.last_row_id).first();
  return json({ ...node, meta: safeJson(node!.meta, {}) }, 201);
}

export async function handleUpdateHierarchy(request: Request, admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const node = await env.DB.prepare("SELECT * FROM hierarchy_nodes WHERE id = ? AND institution_id = ?")
    .bind(id, instId).first();
  if (!node) return json({ detail: "Topilmadi" }, 404);

  const b = (await request.json()) as any;
  const fields: string[] = [];
  const values: any[] = [];
  if (typeof b.name === "string") { fields.push("name = ?"); values.push(b.name.trim()); }
  if (typeof b.short_name === "string") { fields.push("short_name = ?"); values.push(b.short_name.trim()); }
  if (typeof b.sort_order === "number") { fields.push("sort_order = ?"); values.push(b.sort_order); }
  if (b.meta && typeof b.meta === "object") { fields.push("meta = ?"); values.push(JSON.stringify(b.meta)); }
  if (fields.length === 0) return json({ detail: "O'zgartirish yo'q" }, 400);
  values.push(id);
  await env.DB.prepare(`UPDATE hierarchy_nodes SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const updated = await env.DB.prepare("SELECT * FROM hierarchy_nodes WHERE id = ?").bind(id).first();
  return json({ ...updated, meta: safeJson(updated!.meta, {}) });
}

export async function handleDeleteHierarchy(admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const node = await env.DB.prepare("SELECT * FROM hierarchy_nodes WHERE id = ? AND institution_id = ?")
    .bind(id, instId).first();
  if (!node) return json({ detail: "Topilmadi" }, 404);

  // Check for children
  const children = await env.DB.prepare("SELECT COUNT(*) as c FROM hierarchy_nodes WHERE parent_id = ?")
    .bind(id).first();
  const childCount = Number(children?.c || 0);
  const groups = await env.DB.prepare("SELECT COUNT(*) as c FROM groups_v2 WHERE parent_node_id = ?")
    .bind(id).first();
  const groupCount = Number(groups?.c || 0);

  if (childCount + groupCount > 0) {
    return json({
      detail: `Bu elementda ${childCount} ta ichki element va ${groupCount} ta guruh mavjud. Avval ularni o'chiring.`,
      has_children: true,
    }, 409);
  }

  await env.DB.prepare("DELETE FROM hierarchy_nodes WHERE id = ?").bind(id).run();
  return json({ status: "ok", deleted_id: id });
}

// ═══════════════════════════════════════════════════════════════
// SUBJECTS
// ═══════════════════════════════════════════════════════════════

export async function handleListSubjects(admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const instType = await getInstitutionType(instId, env);
  const rows = await env.DB.prepare(
    `SELECT s.*,
      (SELECT COUNT(DISTINCT ts.teacher_id) FROM teacher_subjects ts WHERE ts.subject_id = s.id) as teacher_count,
      (SELECT COUNT(DISTINCT tg.group_id) FROM teacher_groups tg WHERE tg.subject_id = s.id) as group_count,
      (SELECT COUNT(DISTINCT sg.student_id)
         FROM teacher_groups tg
         JOIN student_groups sg ON sg.group_id = tg.group_id
         WHERE tg.subject_id = s.id) as student_count
     FROM subjects s
     WHERE s.institution_id = ? AND (s.type IS NULL OR s.type = ?)
     ORDER BY s.name`
  ).bind(instId, instType).all();
  return json(rows.results.map((r: any) => ({
    ...r,
    applicable_grades: safeJson(r.applicable_grades, []),
    meta: safeJson(r.meta, {}),
  })));
}

// ═══════════════════════════════════════════════════════════════
// AUDITORIUMS (HEMIS rooms, read-only reference)
// ═══════════════════════════════════════════════════════════════

export async function handleListAuditoriums(admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const rows = await env.DB.prepare(
    `SELECT id, hemis_code, name, type_name, building_name, volume, active
     FROM auditoriums
     WHERE institution_id = ?
     ORDER BY building_name, name`
  ).bind(instId).all();
  return json(rows.results);
}

export async function handleCreateSubject(request: Request, admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const b = (await request.json()) as any;
  if (!b.name) return json({ detail: "name kerak" }, 400);

  const instType = await getInstitutionType(instId, env);
  const r = await env.DB.prepare(
    `INSERT INTO subjects (institution_id, type, name, short_name, credit_hours, applicable_grades, department_id, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    instId,
    instType,
    b.name.trim(),
    (b.short_name || "").trim(),
    b.credit_hours || 0,
    JSON.stringify(b.applicable_grades || []),
    b.department_id || null,
    JSON.stringify(b.meta || {})
  ).run();
  const s = await env.DB.prepare("SELECT * FROM subjects WHERE id = ?").bind(r.meta.last_row_id).first();
  return json({ ...s, applicable_grades: safeJson(s!.applicable_grades, []), meta: safeJson(s!.meta, {}) }, 201);
}

export async function handleUpdateSubject(request: Request, admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const instType = await getInstitutionType(instId, env);
  const existing = await env.DB.prepare(
    "SELECT * FROM subjects WHERE id = ? AND institution_id = ? AND (type IS NULL OR type = ?)"
  ).bind(id, instId, instType).first();
  if (!existing) return json({ detail: "Topilmadi" }, 404);

  const b = (await request.json()) as any;
  const fields: string[] = [];
  const values: any[] = [];
  if (typeof b.name === "string") { fields.push("name = ?"); values.push(b.name.trim()); }
  if (typeof b.short_name === "string") { fields.push("short_name = ?"); values.push(b.short_name.trim()); }
  if (typeof b.credit_hours === "number") { fields.push("credit_hours = ?"); values.push(b.credit_hours); }
  if (Array.isArray(b.applicable_grades)) { fields.push("applicable_grades = ?"); values.push(JSON.stringify(b.applicable_grades)); }
  if ("department_id" in b) { fields.push("department_id = ?"); values.push(b.department_id || null); }
  if (fields.length === 0) return json({ detail: "O'zgartirish yo'q" }, 400);
  values.push(id);
  await env.DB.prepare(`UPDATE subjects SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const s = await env.DB.prepare("SELECT * FROM subjects WHERE id = ?").bind(id).first();
  return json({ ...s, applicable_grades: safeJson(s!.applicable_grades, []), meta: safeJson(s!.meta, {}) });
}

export async function handleDeleteSubject(admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const instType = await getInstitutionType(instId, env);
  const existing = await env.DB.prepare(
    "SELECT id FROM subjects WHERE id = ? AND institution_id = ? AND (type IS NULL OR type = ?)"
  ).bind(id, instId, instType).first();
  if (!existing) return json({ detail: "Topilmadi" }, 404);

  await env.DB.prepare("DELETE FROM teacher_subjects WHERE subject_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM teacher_groups WHERE subject_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM subjects WHERE id = ?").bind(id).run();
  return json({ status: "ok", deleted_id: id });
}

// ═══════════════════════════════════════════════════════════════
// GROUPS (v2)
// ═══════════════════════════════════════════════════════════════

export async function handleListGroups(request: Request, admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;

  const url = new URL(request.url);
  const parentId = url.searchParams.get("parent_node_id");

  const allowedTypes = await getAllowedNodeTypes(instId, env);
  const allowedPh = allowedTypes.map(() => "?").join(",");

  let query = `
    SELECT g.*, h.name as parent_name, h.node_type as parent_node_type,
           u.name as class_teacher_name,
           (SELECT COUNT(*) FROM student_groups sg WHERE sg.group_id = g.id) as student_count,
           (SELECT COUNT(DISTINCT tg.teacher_id) FROM teacher_groups tg WHERE tg.group_id = g.id) as teacher_count,
           (SELECT COUNT(*) FROM lessons l WHERE l.group_name = g.name) as lesson_count,
           (SELECT ROUND(AVG(e.overall_score)) FROM lessons l JOIN evaluations e ON e.lesson_id = l.id WHERE l.group_name = g.name) as avg_score
    FROM groups_v2 g
    LEFT JOIN hierarchy_nodes h ON g.parent_node_id = h.id
    LEFT JOIN users u ON g.class_teacher_id = u.id
    WHERE g.institution_id = ?
      AND (g.parent_node_id IS NULL OR h.node_type IN (${allowedPh}))
  `;
  const binds: any[] = [instId, ...allowedTypes];
  if (parentId) { query += " AND g.parent_node_id = ?"; binds.push(parseInt(parentId)); }
  query += " ORDER BY g.name";

  const rows = await env.DB.prepare(query).bind(...binds).all();
  return json(rows.results.map((r: any) => ({
    ...r,
    meta: safeJson(r.meta, {}),
  })));
}

export async function handleGetGroup(admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const g = await env.DB.prepare(`
    SELECT g.*, h.name as parent_name, h.node_type as parent_node_type,
           u.name as class_teacher_name
    FROM groups_v2 g
    LEFT JOIN hierarchy_nodes h ON g.parent_node_id = h.id
    LEFT JOIN users u ON g.class_teacher_id = u.id
    WHERE g.id = ? AND g.institution_id = ?
  `).bind(id, instId).first();
  if (!g) return json({ detail: "Topilmadi" }, 404);

  const students = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.avatar FROM users u
    JOIN student_groups sg ON sg.student_id = u.id WHERE sg.group_id = ?
  `).bind(id).all();

  // Teachers: assigned + per-teacher stats scoped to this group (by name match on lessons)
  const teachers = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.avatar,
      GROUP_CONCAT(DISTINCT s.name) as subjects,
      (SELECT COUNT(*) FROM lessons l WHERE l.user_id = u.id AND l.group_name = ?) as lesson_count,
      (SELECT ROUND(AVG(e.overall_score)) FROM lessons l JOIN evaluations e ON e.lesson_id = l.id WHERE l.user_id = u.id AND l.group_name = ?) as avg_score,
      (SELECT COALESCE(SUM(l.duration_seconds), 0) FROM lessons l WHERE l.user_id = u.id AND l.group_name = ?) as total_seconds
    FROM users u
    JOIN teacher_groups tg ON tg.teacher_id = u.id
    LEFT JOIN subjects s ON tg.subject_id = s.id
    WHERE tg.group_id = ?
    GROUP BY u.id
    ORDER BY avg_score IS NULL, avg_score DESC, u.name
  `).bind(g.name, g.name, g.name, id).all();

  // Group-wide aggregate stats
  const groupStats = await env.DB.prepare(`
    SELECT COUNT(l.id) as lesson_count,
      ROUND(AVG(e.overall_score)) as avg_score,
      COALESCE(SUM(l.duration_seconds), 0) as total_seconds
    FROM lessons l LEFT JOIN evaluations e ON e.lesson_id = l.id
    WHERE l.group_name = ?
  `).bind(g.name).first();

  // Test attempts stats for students in this group
  const testStats = await env.DB.prepare(`
    SELECT COUNT(ta.id) as attempt_count,
      ROUND(AVG(ta.score)) as avg_test_score
    FROM test_attempts ta
    JOIN student_groups sg ON sg.student_id = ta.student_id
    WHERE sg.group_id = ?
  `).bind(id).first();

  return json({
    ...g,
    meta: safeJson(g.meta, {}),
    students: students.results,
    teachers: (teachers.results as any[]).map((t) => ({
      ...t,
      lesson_count: Number(t.lesson_count || 0),
      avg_score: Number(t.avg_score || 0),
      total_minutes: Math.round(Number(t.total_seconds || 0) / 60),
    })),
    stats: {
      lesson_count: Number(groupStats?.lesson_count || 0),
      avg_score: Number(groupStats?.avg_score || 0),
      total_minutes: Math.round(Number(groupStats?.total_seconds || 0) / 60),
      test_attempts: Number(testStats?.attempt_count || 0),
      avg_test_score: Number(testStats?.avg_test_score || 0),
    },
  });
}

export async function handleCreateGroup(request: Request, admin: any, env: Env): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const b = (await request.json()) as any;
  if (!b.name) return json({ detail: "name kerak" }, 400);

  const r = await env.DB.prepare(
    `INSERT INTO groups_v2 (institution_id, parent_node_id, name, short_name, class_teacher_id, schedule, start_date, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    instId,
    b.parent_node_id || null,
    b.name.trim(),
    (b.short_name || "").trim(),
    b.class_teacher_id || null,
    (b.schedule || "").trim(),
    (b.start_date || "").trim(),
    JSON.stringify(b.meta || {})
  ).run();
  const g = await env.DB.prepare("SELECT * FROM groups_v2 WHERE id = ?").bind(r.meta.last_row_id).first();
  return json({ ...g, meta: safeJson(g!.meta, {}) }, 201);
}

export async function handleUpdateGroup(request: Request, admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const existing = await env.DB.prepare("SELECT id FROM groups_v2 WHERE id = ? AND institution_id = ?")
    .bind(id, instId).first();
  if (!existing) return json({ detail: "Topilmadi" }, 404);

  const b = (await request.json()) as any;
  const fields: string[] = [];
  const values: any[] = [];
  if (typeof b.name === "string") { fields.push("name = ?"); values.push(b.name.trim()); }
  if (typeof b.short_name === "string") { fields.push("short_name = ?"); values.push(b.short_name.trim()); }
  if ("parent_node_id" in b) { fields.push("parent_node_id = ?"); values.push(b.parent_node_id || null); }
  if ("class_teacher_id" in b) { fields.push("class_teacher_id = ?"); values.push(b.class_teacher_id || null); }
  if (typeof b.schedule === "string") { fields.push("schedule = ?"); values.push(b.schedule.trim()); }
  if (typeof b.start_date === "string") { fields.push("start_date = ?"); values.push(b.start_date.trim()); }
  if (fields.length === 0) return json({ detail: "O'zgartirish yo'q" }, 400);
  values.push(id);
  await env.DB.prepare(`UPDATE groups_v2 SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  const g = await env.DB.prepare("SELECT * FROM groups_v2 WHERE id = ?").bind(id).first();
  return json({ ...g, meta: safeJson(g!.meta, {}) });
}

export async function handleDeleteGroup(admin: any, env: Env, id: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const existing = await env.DB.prepare("SELECT id FROM groups_v2 WHERE id = ? AND institution_id = ?")
    .bind(id, instId).first();
  if (!existing) return json({ detail: "Topilmadi" }, 404);

  await env.DB.prepare("DELETE FROM student_groups WHERE group_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM teacher_groups WHERE group_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM groups_v2 WHERE id = ?").bind(id).run();
  return json({ status: "ok", deleted_id: id });
}

// ═══════════════════════════════════════════════════════════════
// TEACHER ASSIGNMENTS (subjects + groups)
// ═══════════════════════════════════════════════════════════════

export async function handleGetTeacherAssignments(admin: any, env: Env, teacherId: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const instType = await getInstitutionType(instId, env);
  const t = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND role = 'teacher'
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(teacherId, instId, instType).first();
  if (!t) return json({ detail: "O'qituvchi topilmadi" }, 404);

  const allowedTypes = await getAllowedNodeTypes(instId, env);
  const allowedPh = allowedTypes.map(() => "?").join(",");

  const subjects = await env.DB.prepare(
    `SELECT s.id, s.name, s.short_name FROM subjects s
     JOIN teacher_subjects ts ON ts.subject_id = s.id
     WHERE ts.teacher_id = ? AND s.institution_id = ? AND (s.type IS NULL OR s.type = ?)
     ORDER BY s.name`
  ).bind(teacherId, instId, instType).all();

  const groups = await env.DB.prepare(
    `SELECT g.id, g.name, g.short_name, tg.subject_id,
            s.name as subject_name, h.name as parent_name
     FROM groups_v2 g
     JOIN teacher_groups tg ON tg.group_id = g.id
     LEFT JOIN subjects s ON tg.subject_id = s.id
     LEFT JOIN hierarchy_nodes h ON g.parent_node_id = h.id
     WHERE tg.teacher_id = ? AND g.institution_id = ?
       AND (g.parent_node_id IS NULL OR h.node_type IN (${allowedPh}))
     ORDER BY g.name`
  ).bind(teacherId, instId, ...allowedTypes).all();

  return json({ subjects: subjects.results, groups: groups.results });
}

export async function handleSetTeacherAssignments(request: Request, admin: any, env: Env, teacherId: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const instType = await getInstitutionType(instId, env);
  const t = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND role = 'teacher'
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(teacherId, instId, instType).first();
  if (!t) return json({ detail: "O'qituvchi topilmadi" }, 404);

  const b = (await request.json()) as any;
  const subjectIds: number[] = Array.isArray(b.subject_ids) ? b.subject_ids.map(Number).filter(Boolean) : [];
  const groupEntries: Array<{ group_id: number; subject_id?: number }> = Array.isArray(b.groups) ? b.groups : [];

  const allowedTypes = await getAllowedNodeTypes(instId, env);
  const allowedPh = allowedTypes.map(() => "?").join(",");

  // Replace subjects (only current-type subjects; preserve assignments of other types)
  await env.DB.prepare(
    `DELETE FROM teacher_subjects WHERE teacher_id = ? AND subject_id IN
     (SELECT id FROM subjects WHERE institution_id = ? AND (type IS NULL OR type = ?))`
  ).bind(teacherId, instId, instType).run();
  for (const sid of subjectIds) {
    const own = await env.DB.prepare(
      "SELECT id FROM subjects WHERE id = ? AND institution_id = ? AND (type IS NULL OR type = ?)"
    ).bind(sid, instId, instType).first();
    if (own) {
      await env.DB.prepare("INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)")
        .bind(teacherId, sid).run();
    }
  }

  // Replace groups (only current-type groups; preserve assignments of other types)
  await env.DB.prepare(
    `DELETE FROM teacher_groups WHERE teacher_id = ? AND group_id IN
     (SELECT g.id FROM groups_v2 g LEFT JOIN hierarchy_nodes h ON g.parent_node_id = h.id
      WHERE g.institution_id = ? AND (g.parent_node_id IS NULL OR h.node_type IN (${allowedPh})))`
  ).bind(teacherId, instId, ...allowedTypes).run();
  for (const g of groupEntries) {
    if (!g.group_id) continue;
    const own = await env.DB.prepare(
      `SELECT g.id FROM groups_v2 g LEFT JOIN hierarchy_nodes h ON g.parent_node_id = h.id
       WHERE g.id = ? AND g.institution_id = ? AND (g.parent_node_id IS NULL OR h.node_type IN (${allowedPh}))`
    ).bind(g.group_id, instId, ...allowedTypes).first();
    if (!own) continue;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO teacher_groups (teacher_id, group_id, subject_id) VALUES (?, ?, ?)"
    ).bind(teacherId, g.group_id, g.subject_id || null).run();
  }

  return handleGetTeacherAssignments(admin, env, teacherId);
}

// ═══════════════════════════════════════════════════════════════
// STUDENT GROUPS
// ═══════════════════════════════════════════════════════════════

export async function handleSetStudentGroups(request: Request, admin: any, env: Env, studentId: number): Promise<Response> {
  const [instId, err] = await requireInstitution(admin);
  if (err) return err;
  const instType = await getInstitutionType(instId, env);
  const s = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND role = 'student'
       AND institution_id = ? AND (type IS NULL OR type = ?)`
  ).bind(studentId, instId, instType).first();
  if (!s) return json({ detail: "O'quvchi topilmadi" }, 404);

  const b = (await request.json()) as any;
  const groupIds: number[] = Array.isArray(b.group_ids) ? b.group_ids.map(Number).filter(Boolean) : [];

  const allowedTypes = await getAllowedNodeTypes(instId, env);
  const allowedPh = allowedTypes.map(() => "?").join(",");

  // Only clear current-type memberships; preserve memberships in other types.
  await env.DB.prepare(
    `DELETE FROM student_groups WHERE student_id = ? AND group_id IN
     (SELECT g.id FROM groups_v2 g LEFT JOIN hierarchy_nodes h ON g.parent_node_id = h.id
      WHERE g.institution_id = ? AND (g.parent_node_id IS NULL OR h.node_type IN (${allowedPh})))`
  ).bind(studentId, instId, ...allowedTypes).run();
  for (const gid of groupIds) {
    const own = await env.DB.prepare(
      `SELECT g.id FROM groups_v2 g LEFT JOIN hierarchy_nodes h ON g.parent_node_id = h.id
       WHERE g.id = ? AND g.institution_id = ? AND (g.parent_node_id IS NULL OR h.node_type IN (${allowedPh}))`
    ).bind(gid, instId, ...allowedTypes).first();
    if (!own) continue;
    await env.DB.prepare("INSERT OR IGNORE INTO student_groups (student_id, group_id) VALUES (?, ?)")
      .bind(studentId, gid).run();
  }

  const assigned = await env.DB.prepare(
    `SELECT g.id, g.name FROM groups_v2 g
     LEFT JOIN hierarchy_nodes h ON g.parent_node_id = h.id
     JOIN student_groups sg ON sg.group_id = g.id
     WHERE sg.student_id = ? AND g.institution_id = ?
       AND (g.parent_node_id IS NULL OR h.node_type IN (${allowedPh}))
     ORDER BY g.name`
  ).bind(studentId, instId, ...allowedTypes).all();

  return json({ student_id: studentId, groups: assigned.results });
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

function safeJson<T>(raw: any, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== "string") return raw as T;
  try { return JSON.parse(raw); } catch { return fallback; }
}
