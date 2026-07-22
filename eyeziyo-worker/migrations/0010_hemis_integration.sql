-- HEMIS integration: link eyeziyo structural entities to their HEMIS source
-- rows so the admin panel can be populated (and re-synced) from the HEMIS
-- "Backend API" (/v1/data/*). Sync is one-way (HEMIS -> eyeziyo); HEMIS is the
-- master for structure/people, eyeziyo owns lessons/evaluations.
--
-- Each synced row carries the HEMIS numeric id (scoped per institution). We use
-- partial UNIQUE indexes (WHERE hemis_id IS NOT NULL) so pre-existing, manually
-- created rows (hemis_id = NULL) are untouched and the upsert can target the
-- (institution_id, hemis_id) pair.

-- Institutions: remember which HEMIS university this maps to + last sync time.
ALTER TABLE institutions ADD COLUMN hemis_university_code TEXT DEFAULT '';
ALTER TABLE institutions ADD COLUMN hemis_synced_at INTEGER DEFAULT NULL;

-- hierarchy_nodes: faculty (department) + direction (specialty) come from HEMIS.
ALTER TABLE hierarchy_nodes ADD COLUMN hemis_id INTEGER DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hnodes_hemis
  ON hierarchy_nodes(institution_id, node_type, hemis_id)
  WHERE hemis_id IS NOT NULL;

-- subjects
ALTER TABLE subjects ADD COLUMN hemis_id INTEGER DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_hemis
  ON subjects(institution_id, hemis_id)
  WHERE hemis_id IS NOT NULL;

-- groups
ALTER TABLE groups_v2 ADD COLUMN hemis_id INTEGER DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_v2_hemis
  ON groups_v2(institution_id, hemis_id)
  WHERE hemis_id IS NOT NULL;

-- users (teachers = HEMIS employee.id, students = HEMIS student.id) + PINFL as
-- the stable identity key used by SSO login.
ALTER TABLE users ADD COLUMN hemis_id INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN pinfl TEXT DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_hemis
  ON users(institution_id, role, hemis_id)
  WHERE hemis_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_pinfl
  ON users(pinfl)
  WHERE pinfl IS NOT NULL;

-- Per-entity sync bookkeeping (last run timestamp + last processed page/count).
CREATE TABLE IF NOT EXISTS hemis_sync_state (
  institution_id INTEGER NOT NULL,
  entity TEXT NOT NULL,                 -- 'departments'|'specialties'|'subjects'|'groups'|'teachers'|'students'|'assignments'
  last_page INTEGER DEFAULT 0,
  last_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  synced_at INTEGER DEFAULT NULL,
  PRIMARY KEY (institution_id, entity)
);
