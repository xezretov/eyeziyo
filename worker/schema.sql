-- ═══════════════════════════════════════════════════════════════
-- tatuziyo (tuit.eyeziyo.uz) — eyeziyo admin sxemasi (HEMIS'siz) + audiotap konveyeri
--
-- Admin panel (institution, iyerarxiya, guruhlar, fanlar, o'qituvchilar,
-- o'quvchilar, baholash savollari, darslar, baholar) eyeziyo bilan BIR XIL.
-- Farq: darslar Android app'dan emas, audiotap yozuvlaridan keladi
-- (recordings → transcript → biriktirish → lessons + evaluations).
-- ═══════════════════════════════════════════════════════════════

-- ── Foydalanuvchilar: admin | teacher | student ──
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  avatar TEXT DEFAULT '',
  groups TEXT DEFAULT '[]',
  course_type TEXT DEFAULT '',
  institution_id INTEGER DEFAULT NULL,
  type TEXT DEFAULT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_role_type ON users(role, type);
CREATE INDEX IF NOT EXISTS idx_users_inst_type ON users(institution_id, type);
CREATE INDEX IF NOT EXISTS idx_users_role_inst ON users(role, institution_id);

-- ── Muassasa (bitta: TUIT) ──
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

-- ── Iyerarxiya: university: faculty → direction → course ──
CREATE TABLE IF NOT EXISTS hierarchy_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  parent_id INTEGER DEFAULT NULL,
  node_type TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (parent_id) REFERENCES hierarchy_nodes(id)
);
CREATE INDEX IF NOT EXISTS idx_hnodes_inst ON hierarchy_nodes(institution_id, node_type);
CREATE INDEX IF NOT EXISTS idx_hnodes_parent ON hierarchy_nodes(parent_id);

-- ── Guruhlar ──
CREATE TABLE IF NOT EXISTS groups_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  parent_node_id INTEGER DEFAULT NULL,
  name TEXT NOT NULL,
  short_name TEXT DEFAULT '',
  class_teacher_id INTEGER DEFAULT NULL,
  schedule TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (parent_node_id) REFERENCES hierarchy_nodes(id),
  FOREIGN KEY (class_teacher_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_groups_v2_inst ON groups_v2(institution_id);
CREATE INDEX IF NOT EXISTS idx_groups_v2_parent ON groups_v2(parent_node_id);

-- ── Fanlar ──
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT DEFAULT '',
  credit_hours INTEGER DEFAULT 0,
  applicable_grades TEXT DEFAULT '[]',
  department_id INTEGER DEFAULT NULL,
  meta TEXT DEFAULT '{}',
  type TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (department_id) REFERENCES hierarchy_nodes(id)
);
CREATE INDEX IF NOT EXISTS idx_subjects_inst ON subjects(institution_id);
CREATE INDEX IF NOT EXISTS idx_subjects_inst_type ON subjects(institution_id, type);

-- ── Biriktirishlar ──
CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacher_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  PRIMARY KEY (teacher_id, subject_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);
CREATE TABLE IF NOT EXISTS teacher_groups (
  teacher_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  subject_id INTEGER DEFAULT NULL,
  PRIMARY KEY (teacher_id, group_id, subject_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (group_id) REFERENCES groups_v2(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_groups_group ON teacher_groups(group_id);
CREATE TABLE IF NOT EXISTS student_groups (
  student_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  PRIMARY KEY (student_id, group_id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (group_id) REFERENCES groups_v2(id)
);
CREATE INDEX IF NOT EXISTS idx_student_groups_group ON student_groups(group_id);

-- ── Darslar (audiotap yozuvi biriktirilib baholangach shu yerga tushadi) ──
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  group_name TEXT NOT NULL,
  topic TEXT NOT NULL,
  course_type TEXT DEFAULT '',
  duration_seconds INTEGER DEFAULT 0,
  transcript TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_user_created ON lessons(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_group_name ON lessons(group_name);

-- ── AI baho — 5 mezon (0-20), overall = yig'indi ──
CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER UNIQUE NOT NULL,
  overall_score INTEGER DEFAULT 0,
  topic_score INTEGER DEFAULT 0,
  speech_score INTEGER DEFAULT 0,
  method_score INTEGER DEFAULT 0,
  interaction_score INTEGER DEFAULT 0,
  feedback_score INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  strengths TEXT DEFAULT '[]',
  improvements TEXT DEFAULT '[]',
  advice TEXT DEFAULT '[]',
  model TEXT DEFAULT '',
  timeline TEXT DEFAULT '',   -- JSON: dars bosqichlari + ovoz manbalari statistikasi (2026-09-28)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id)
);
CREATE INDEX IF NOT EXISTS idx_evaluations_lesson_id ON evaluations(lesson_id);

CREATE TABLE IF NOT EXISTS lesson_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  segment_index INTEGER NOT NULL,
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  text TEXT NOT NULL,
  topic_summary TEXT DEFAULT '',
  score INTEGER,
  strengths TEXT DEFAULT '[]',
  issues TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lesson_id, segment_index),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_segments_lesson ON lesson_segments(lesson_id, segment_index);

-- ── O'quvchi testlari va chat (Mentor; admin panelda statistika uchun) ──
CREATE TABLE IF NOT EXISTS lesson_tests (
  lesson_id INTEGER PRIMARY KEY,
  questions TEXT NOT NULL,
  key_terms TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id)
);
CREATE TABLE IF NOT EXISTS test_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  answers TEXT NOT NULL,
  score INTEGER NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lesson_id, student_id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_test_attempts_student ON test_attempts(student_id, completed_at);
CREATE TABLE IF NOT EXISTS mentor_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_mentor_chats_lookup ON mentor_chats(lesson_id, student_id, created_at);

-- ── Baholash savollari (o'quvchi so'rovnomasi) ──
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
CREATE INDEX IF NOT EXISTS idx_eval_q_inst ON evaluation_questions(institution_id, active);
CREATE TABLE IF NOT EXISTS evaluation_question_subjects (
  question_id INTEGER NOT NULL,
  subject_id  INTEGER NOT NULL,
  PRIMARY KEY (question_id, subject_id),
  FOREIGN KEY (question_id) REFERENCES evaluation_questions(id),
  FOREIGN KEY (subject_id)  REFERENCES subjects(id)
);
CREATE INDEX IF NOT EXISTS idx_eqs_subject ON evaluation_question_subjects(subject_id);
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

-- ── Auth yordamchi jadvallar ──
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ═══════════════ Audiotap konveyeri ═══════════════

-- Audio manbalari (xonalar): audiotap "audio_source.name" ↔ real auditoriya
CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  audiotap_name TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL DEFAULT '',
  building      TEXT DEFAULT '',
  room          TEXT DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Yozuvlar: webhook'dan kelgan har bir artifact.
-- status: queued → downloading → stored → transcribing → awaiting_assignment
--         → analyzing → done | failed | skipped
CREATE TABLE IF NOT EXISTS recordings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id          TEXT NOT NULL,
  recording_id      TEXT NOT NULL,
  event_type        TEXT NOT NULL DEFAULT 'recording.available',
  source_id         INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  source_name       TEXT DEFAULT '',
  schedule_name     TEXT DEFAULT '',
  profile           TEXT DEFAULT '',
  codec             TEXT DEFAULT '',
  container         TEXT DEFAULT '',
  size_bytes        INTEGER DEFAULT 0,
  duration_seconds  REAL    DEFAULT 0,
  checksum_sha256   TEXT DEFAULT '',
  download_url      TEXT DEFAULT '',
  started_at        TEXT DEFAULT '',
  finalized_at      TEXT DEFAULT '',
  completeness      TEXT DEFAULT '',
  gap_seconds_total REAL    DEFAULT 0,
  r2_key            TEXT DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'queued',
  error             TEXT DEFAULT '',
  attempts          INTEGER NOT NULL DEFAULT 0,
  payload           TEXT DEFAULT '',
  -- Qo'lda biriktiriladigan kontekst (o'qituvchi = users.role='teacher')
  teacher_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  group_id          INTEGER REFERENCES groups_v2(id) ON DELETE SET NULL,
  group_name        TEXT DEFAULT '',
  topic             TEXT DEFAULT '',
  assigned_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMP,
  -- Baholangach yaratiladigan dars
  lesson_id         INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  -- Gemini Batch STT (status = stt_batch): job nomi "batches/..." va yuborilgan vaqt
  batch_name        TEXT DEFAULT '',
  batch_submitted_at TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_event_profile ON recordings(event_id, profile);
CREATE INDEX IF NOT EXISTS idx_rec_status    ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_rec_created   ON recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_teacher   ON recordings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_rec_lesson    ON recordings(lesson_id);

-- Transkript (biriktirishdan oldin ham kerak — shuning uchun lessons'dan alohida)
CREATE TABLE IF NOT EXISTS transcripts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  text         TEXT NOT NULL DEFAULT '',
  char_count   INTEGER NOT NULL DEFAULT 0,
  word_count   INTEGER NOT NULL DEFAULT 0,
  model        TEXT DEFAULT '',
  stats        TEXT DEFAULT '',   -- JSON: O'QITUVCHI/TALABA/VIDEO/jimlik ulushlari, vaqt chizig'i (2026-09-28)
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- STT bo'lak keshi: har ~10 daqiqalik bo'lakning tayyor (polish qilingan) matni.
-- Queue/cron qayta yuborsa yoki consumer 15 daqiqada uzilsa — pullik STT takrorlanmaydi.
CREATE TABLE IF NOT EXISTS stt_chunks (
  recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  idx          INTEGER NOT NULL,
  total        INTEGER NOT NULL DEFAULT 1,
  start_sec    REAL DEFAULT 0,
  end_sec      REAL DEFAULT 0,
  text         TEXT NOT NULL DEFAULT '',
  model        TEXT DEFAULT '',
  note         TEXT DEFAULT '',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recording_id, idx)
);

-- Gemini token/xarajat hisobi (usageMetadata): har pullik chaqiruv bitta qator. usd — tarif bo'yicha hisob.
CREATE TABLE IF NOT EXISTS gemini_usage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER,
  stage        TEXT NOT NULL,            -- stt (STT + polish) | eval
  model        TEXT DEFAULT '',
  batch        INTEGER DEFAULT 0,        -- 1 = Batch API (50%)
  audio_in     INTEGER DEFAULT 0,
  text_in      INTEGER DEFAULT 0,
  out_tokens   INTEGER DEFAULT 0,
  usd          REAL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gusage_created ON gemini_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_gusage_rec ON gemini_usage(recording_id);

-- Ishlov berish jurnali
CREATE TABLE IF NOT EXISTS processing_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL,
  status       TEXT NOT NULL,
  message      TEXT DEFAULT '',
  duration_ms  INTEGER DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pe_rec ON processing_events(recording_id, id DESC);
