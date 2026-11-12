-- Subject-side lookups. teacher_subjects / teacher_groups primary keys lead
-- with teacher_id, so aggregating "per subject" (admin subjects list) had to
-- scan the whole table for every subject row. With HEMIS-sized data (5.7k
-- subjects x 20k teacher_groups) that exceeded D1's CPU limit.

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject ON teacher_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_groups_subject ON teacher_groups(subject_id, group_id);
