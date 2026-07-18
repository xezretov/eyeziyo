-- Per-lesson time-stamped transcript segments + per-segment AI evaluation.
-- Each segment is a slice of the lesson's transcript bound to a [start,end]
-- window in the recording. The AI evaluator scores each segment independently
-- so admins can see where the lesson dragged or shone.
--
-- Real recordings produce these via the Durable Object during transcription
-- (future work). For backfill, we slice existing `lessons.transcript` text
-- into equal-time windows and run a deterministic stand-in evaluator —
-- separate seed script handles that.

CREATE TABLE IF NOT EXISTS lesson_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  segment_index INTEGER NOT NULL,        -- 0-based ordering within the lesson
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  text TEXT NOT NULL,
  topic_summary TEXT DEFAULT '',         -- one-line summary, what the segment was about
  score INTEGER,                         -- 0..100 per-segment AI score, NULL if not yet evaluated
  strengths TEXT DEFAULT '[]',           -- JSON string array
  issues TEXT DEFAULT '[]',              -- JSON string array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lesson_id, segment_index),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_segments_lesson
  ON lesson_segments(lesson_id, segment_index);
