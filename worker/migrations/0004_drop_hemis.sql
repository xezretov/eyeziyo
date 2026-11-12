-- HEMIS integratsiyasini olib tashlash (2026-09-16). 0003_hemis.sql ning teskarisi:
--   * HEMIS'dan sinxron qilingan ma'lumotlar o'chiriladi (users/hierarchy_nodes/groups_v2/subjects
--     dagi hemis_id IS NOT NULL qatorlar + ularga bog'liq teacher_subjects/teacher_groups/student_groups)
--   * hemis_schedule, hemis_sync_state, auditoriums jadvallari o'chiriladi
--   * hemis_* ustunlar va indekslar olib tashlanadi
-- Admin foydalanuvchi (hemis_id NULL) va institutions qatori saqlanadi.
--
-- Prodga qo'llash (bir marta):
--   npx wrangler d1 execute tatuziyo-db --remote --file=migrations/0004_drop_hemis.sql
-- schema.sql allaqachon HEMIS'siz (git HEAD holati) — bu fayl faqat mavjud bazaga.

-- ── 1. HEMIS'dan kelgan ma'lumotlar ──
DELETE FROM teacher_groups WHERE teacher_id IN (SELECT id FROM users WHERE hemis_id IS NOT NULL)
   OR group_id IN (SELECT id FROM groups_v2 WHERE hemis_id IS NOT NULL)
   OR subject_id IN (SELECT id FROM subjects WHERE hemis_id IS NOT NULL);
DELETE FROM teacher_subjects WHERE teacher_id IN (SELECT id FROM users WHERE hemis_id IS NOT NULL)
   OR subject_id IN (SELECT id FROM subjects WHERE hemis_id IS NOT NULL);
DELETE FROM student_groups WHERE student_id IN (SELECT id FROM users WHERE hemis_id IS NOT NULL)
   OR group_id IN (SELECT id FROM groups_v2 WHERE hemis_id IS NOT NULL);
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE hemis_id IS NOT NULL);

-- Yozuvlar/darslardagi havolalar (prodda 2026-09-16 holatida biriktirilgan yozuv yo'q)
UPDATE recordings SET hemis_schedule_id = NULL WHERE hemis_schedule_id IS NOT NULL;
UPDATE recordings SET teacher_id = NULL WHERE teacher_id IN (SELECT id FROM users WHERE hemis_id IS NOT NULL);
UPDATE recordings SET subject_id = NULL WHERE subject_id IN (SELECT id FROM subjects WHERE hemis_id IS NOT NULL);
UPDATE recordings SET group_id = NULL WHERE group_id IN (SELECT id FROM groups_v2 WHERE hemis_id IS NOT NULL);
UPDATE sources SET auditorium_id = NULL WHERE auditorium_id IS NOT NULL;

DELETE FROM groups_v2 WHERE hemis_id IS NOT NULL;
DELETE FROM subjects WHERE hemis_id IS NOT NULL;
DELETE FROM hierarchy_nodes WHERE hemis_id IS NOT NULL;
DELETE FROM users WHERE hemis_id IS NOT NULL;

-- ── 2. HEMIS jadvallari ──
DROP TABLE IF EXISTS hemis_schedule;
DROP TABLE IF EXISTS hemis_sync_state;
DROP TABLE IF EXISTS auditoriums;

-- ── 3. Indekslar, keyin ustunlar ──
DROP INDEX IF EXISTS idx_hsched_hemis;
DROP INDEX IF EXISTS idx_hsched_lookup;
DROP INDEX IF EXISTS idx_auditoriums_hemis;
DROP INDEX IF EXISTS idx_users_hemis;
DROP INDEX IF EXISTS idx_users_pinfl;
DROP INDEX IF EXISTS idx_hnodes_hemis;
DROP INDEX IF EXISTS idx_groups_v2_hemis;
DROP INDEX IF EXISTS idx_subjects_hemis;

ALTER TABLE users DROP COLUMN hemis_id;
ALTER TABLE users DROP COLUMN pinfl;
ALTER TABLE institutions DROP COLUMN hemis_university_code;
ALTER TABLE institutions DROP COLUMN hemis_synced_at;
ALTER TABLE hierarchy_nodes DROP COLUMN hemis_id;
ALTER TABLE groups_v2 DROP COLUMN hemis_id;
ALTER TABLE subjects DROP COLUMN hemis_id;
ALTER TABLE recordings DROP COLUMN hemis_schedule_id;
ALTER TABLE sources DROP COLUMN auditorium_id;
