-- Scope subjects to the institution type they were created under,
-- so university subjects don't leak into school view (and vice versa).

ALTER TABLE subjects ADD COLUMN type TEXT DEFAULT NULL;

-- Backfill from existing columns:
--   department_id set → university
--   applicable_grades non-empty → school
UPDATE subjects SET type = 'university'
  WHERE type IS NULL AND department_id IS NOT NULL;

UPDATE subjects SET type = 'school'
  WHERE type IS NULL AND applicable_grades IS NOT NULL AND applicable_grades != '[]' AND applicable_grades != '';

-- Remaining rows: fall back to the institution's current type.
UPDATE subjects
  SET type = (SELECT i.type FROM institutions i WHERE i.id = subjects.institution_id)
  WHERE type IS NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_inst_type ON subjects(institution_id, type);
