-- Multi-subject support for evaluation questions.
--
-- Previously each evaluation_question had a single subject_id column.
-- Now we use a junction table so one question can apply to multiple subjects.
-- subject_id IS NULL in the old column meant "all subjects (global)".
-- With the junction table: no rows in eqs → question is global.

CREATE TABLE IF NOT EXISTS evaluation_question_subjects (
  question_id INTEGER NOT NULL,
  subject_id  INTEGER NOT NULL,
  PRIMARY KEY (question_id, subject_id),
  FOREIGN KEY (question_id) REFERENCES evaluation_questions(id),
  FOREIGN KEY (subject_id)  REFERENCES subjects(id)
);

CREATE INDEX IF NOT EXISTS idx_eqs_subject ON evaluation_question_subjects(subject_id);

-- Migrate existing single-subject data into the junction table
INSERT OR IGNORE INTO evaluation_question_subjects (question_id, subject_id)
SELECT id, subject_id FROM evaluation_questions WHERE subject_id IS NOT NULL;

-- Clear the old column (keep it for safety, but no longer used)
UPDATE evaluation_questions SET subject_id = NULL WHERE subject_id IS NOT NULL;
