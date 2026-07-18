-- Scope teachers/students to the institution type they were created under.
-- Admins remain type-less (they operate across all types).

ALTER TABLE users ADD COLUMN type TEXT DEFAULT NULL;

-- Backfill: teachers/students get their institution's current type
UPDATE users
  SET type = (SELECT i.type FROM institutions i WHERE i.id = users.institution_id)
  WHERE type IS NULL
    AND role IN ('student', 'teacher')
    AND institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_type ON users(role, type);
CREATE INDEX IF NOT EXISTS idx_users_inst_type ON users(institution_id, type);
