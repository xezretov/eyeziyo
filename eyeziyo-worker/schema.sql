-- Eyeziyo D1 Database Schema
-- Compatible with existing SQLite schema from Python backend

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  avatar TEXT DEFAULT '',
  groups TEXT DEFAULT '[]',
  course_type TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER UNIQUE NOT NULL,
  overall_score INTEGER DEFAULT 0,
  clarity_score INTEGER DEFAULT 0,
  engagement_score INTEGER DEFAULT 0,
  content_score INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  strengths TEXT DEFAULT '[]',
  improvements TEXT DEFAULT '[]',
  advice TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id)
);

-- Seed default users
INSERT OR IGNORE INTO users (email, password_hash, name, role, avatar, groups, course_type)
VALUES
  ('admin@eyeziyo.uz', '$2b$12$placeholder_admin_hash', 'Admin', 'admin', 'A', '[]', ''),
  ('mergen@eyeziyo.uz', '$2b$12$placeholder_teacher_hash', 'Mergen Xezretov', 'teacher', 'M', '["BE5", "BE6"]', 'Backend dasturlash');
