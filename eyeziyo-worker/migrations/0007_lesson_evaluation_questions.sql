-- Per-lesson student evaluation questionnaire.
--
-- Admin defines questions (optionally scoped to a subject). Each question is a
-- 1..N rating scale (default 5). After a student finishes a lesson's test,
-- the Mentor app shows them the relevant questions and stores their answers.
--
-- subject_id IS NULL  → question applies to every lesson (institution-wide)
-- subject_id IS NOT NULL → only lessons whose course_type matches that subject

CREATE TABLE IF NOT EXISTS evaluation_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  subject_id INTEGER DEFAULT NULL,
  text TEXT NOT NULL,
  scale INTEGER NOT NULL DEFAULT 5,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE INDEX IF NOT EXISTS idx_eval_q_inst   ON evaluation_questions(institution_id, active);
CREATE INDEX IF NOT EXISTS idx_eval_q_subj   ON evaluation_questions(subject_id, active);

CREATE TABLE IF NOT EXISTS student_lesson_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lesson_id, student_id, question_id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (question_id) REFERENCES evaluation_questions(id)
);

CREATE INDEX IF NOT EXISTS idx_sle_lesson_student ON student_lesson_evaluations(lesson_id, student_id);
CREATE INDEX IF NOT EXISTS idx_sle_question       ON student_lesson_evaluations(question_id);
