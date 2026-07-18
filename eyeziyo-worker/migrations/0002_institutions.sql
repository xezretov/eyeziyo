-- Multi-tenant institutions + hierarchy
-- Supports university, school, and training center types with adaptive structure.

CREATE TABLE IF NOT EXISTS institutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  short_name TEXT DEFAULT '',
  type TEXT NOT NULL,                    -- 'university' | 'school' | 'center'
  logo_url TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  academic_year TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generic hierarchy tree. Level interpretations by institution type:
--   university: faculty(L1) -> department(L2) -> course(L3)
--   school:     parallel(L1) -> class_letter(L2)
--   center:     direction(L1) -> level(L2)
CREATE TABLE IF NOT EXISTS hierarchy_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  parent_id INTEGER DEFAULT NULL,
  node_type TEXT NOT NULL,               -- 'faculty'|'department'|'course'|'parallel'|'class_letter'|'direction'|'level'
  name TEXT NOT NULL,
  short_name TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  meta TEXT DEFAULT '{}',                -- JSON: head_teacher_id, year, duration_months, price, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (parent_id) REFERENCES hierarchy_nodes(id)
);
CREATE INDEX IF NOT EXISTS idx_hnodes_inst ON hierarchy_nodes(institution_id, node_type);
CREATE INDEX IF NOT EXISTS idx_hnodes_parent ON hierarchy_nodes(parent_id);

-- Groups (first-class entity). Parent is a leaf hierarchy node (course/class_letter/level).
CREATE TABLE IF NOT EXISTS groups_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  parent_node_id INTEGER DEFAULT NULL,
  name TEXT NOT NULL,
  short_name TEXT DEFAULT '',
  class_teacher_id INTEGER DEFAULT NULL, -- for schools
  schedule TEXT DEFAULT '',              -- e.g. "Mon/Wed/Fri 14:00"
  start_date TEXT DEFAULT '',
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (parent_node_id) REFERENCES hierarchy_nodes(id),
  FOREIGN KEY (class_teacher_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_groups_v2_inst ON groups_v2(institution_id);
CREATE INDEX IF NOT EXISTS idx_groups_v2_parent ON groups_v2(parent_node_id);

-- Subjects (fanlar)
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT DEFAULT '',
  credit_hours INTEGER DEFAULT 0,
  applicable_grades TEXT DEFAULT '[]',   -- JSON array (school): [5,6,7]
  department_id INTEGER DEFAULT NULL,    -- for university (kafedra)
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (department_id) REFERENCES hierarchy_nodes(id)
);
CREATE INDEX IF NOT EXISTS idx_subjects_inst ON subjects(institution_id);

-- Teacher ↔ Subjects (which subjects a teacher teaches)
CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacher_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  PRIMARY KEY (teacher_id, subject_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- Teacher ↔ Groups (which groups a teacher teaches, optionally for which subject)
CREATE TABLE IF NOT EXISTS teacher_groups (
  teacher_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  subject_id INTEGER DEFAULT NULL,
  PRIMARY KEY (teacher_id, group_id, subject_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (group_id) REFERENCES groups_v2(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- Student ↔ Groups (a student belongs to one or more groups)
CREATE TABLE IF NOT EXISTS student_groups (
  student_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  PRIMARY KEY (student_id, group_id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (group_id) REFERENCES groups_v2(id)
);

-- Attach users to institution (multi-tenant). Existing users get institution_id = NULL
-- until the admin completes onboarding; then they're attached to the first institution.
ALTER TABLE users ADD COLUMN institution_id INTEGER DEFAULT NULL;
