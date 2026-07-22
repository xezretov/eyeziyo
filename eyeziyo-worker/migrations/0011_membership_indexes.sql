-- Membership/aggregation indexes. After HEMIS sync the student_groups and
-- teacher_groups tables grow large (thousands of rows), but their primary keys
-- lead with student_id/teacher_id, so lookups/joins by group_id were unindexed
-- full scans. These indexes back the hierarchy/group aggregation queries.

CREATE INDEX IF NOT EXISTS idx_student_groups_group ON student_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_teacher_groups_group ON teacher_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_lessons_group_name ON lessons(group_name);
