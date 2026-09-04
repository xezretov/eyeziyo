-- ═══════════════════════════════════════════════════════
-- tatuziyo — audiotap webhook → STT → AI baholash platformasi
-- HEMIS integratsiyasi YO'Q. O'qituvchi qo'lda biriktiriladi.
-- ═══════════════════════════════════════════════════════

-- ── Admin foydalanuvchilari (ochiq ro'yxatdan o'tish yo'q) ──
-- Birinchi admin POST /api/auth/bootstrap orqali yaratiladi (faqat jadval bo'sh bo'lsa ishlaydi).
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'admin',   -- admin | viewer
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── O'qituvchilar (qo'lda kiritiladi) ──
CREATE TABLE IF NOT EXISTS teachers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name   TEXT NOT NULL,
  department  TEXT DEFAULT '',
  position    TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_teachers_name ON teachers(full_name);

-- ── Fanlar ──
CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  code       TEXT DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Audio manbalari: audiotap "audio_source.name" ↔ real auditoriya ──
CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  audiotap_name TEXT NOT NULL UNIQUE,   -- payload'dagi audio_source.name
  display_name  TEXT NOT NULL DEFAULT '',
  building      TEXT DEFAULT '',
  room          TEXT DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Yozuvlar: webhook'dan kelgan har bir artifact ──
-- status: queued → downloading → stored → transcribing → awaiting_assignment
--         → analyzing → done   |   failed | skipped
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
  completeness      TEXT DEFAULT '',      -- complete | partial
  gap_seconds_total REAL    DEFAULT 0,

  r2_key            TEXT DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'queued',
  error             TEXT DEFAULT '',
  attempts          INTEGER NOT NULL DEFAULT 0,
  payload           TEXT DEFAULT '',      -- xom webhook JSON (audit)

  -- Qo'lda biriktiriladigan kontekst
  teacher_id        INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic             TEXT DEFAULT '',
  group_name        TEXT DEFAULT '',
  assigned_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMP,

  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audiotap bitta hodisani bir necha profil bilan yuboradi — dedup shart.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_event_profile ON recordings(event_id, profile);
CREATE INDEX IF NOT EXISTS idx_rec_status    ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_rec_created   ON recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_teacher   ON recordings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_rec_recording ON recordings(recording_id);

-- ── Transkript (matn katta — alohida jadval) ──
CREATE TABLE IF NOT EXISTS transcripts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  text         TEXT NOT NULL DEFAULT '',
  char_count   INTEGER NOT NULL DEFAULT 0,
  word_count   INTEGER NOT NULL DEFAULT 0,
  model        TEXT DEFAULT '',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Tahlil natijasi — 5 mezon (eski tizimdagidek) ──
CREATE TABLE IF NOT EXISTS analyses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id      INTEGER NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  overall_score     INTEGER NOT NULL DEFAULT 0,   -- 0-100 (5 mezon yig'indisi)
  topic_score       INTEGER NOT NULL DEFAULT 0,   -- 0-20
  speech_score      INTEGER NOT NULL DEFAULT 0,   -- 0-20
  method_score      INTEGER NOT NULL DEFAULT 0,   -- 0-20
  interaction_score INTEGER NOT NULL DEFAULT 0,   -- 0-20
  feedback_score    INTEGER NOT NULL DEFAULT 0,   -- 0-20
  summary           TEXT DEFAULT '',
  strengths         TEXT DEFAULT '[]',            -- JSON array
  improvements      TEXT DEFAULT '[]',            -- JSON array
  advice            TEXT DEFAULT '[]',            -- JSON array
  model             TEXT DEFAULT '',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analyses_score ON analyses(overall_score);

-- ── Ishlov berish jurnali — dashboard'da "nima bo'lyapti" ──
CREATE TABLE IF NOT EXISTS processing_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL,        -- webhook|download|transcribe|analyze
  status       TEXT NOT NULL,        -- start|ok|error
  message      TEXT DEFAULT '',
  duration_ms  INTEGER DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pe_rec ON processing_events(recording_id, id DESC);

-- ── Rate limit (rateLimit.ts talab qiladi) ──
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
