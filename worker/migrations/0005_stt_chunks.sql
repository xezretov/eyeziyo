-- STT bo'lak keshi (2026-09-22, Gemini xarajati nazorati). schema.sql bilan bir xil.
-- Prod: npx wrangler d1 execute tatuziyo-db --remote --file=migrations/0005_stt_chunks.sql
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
