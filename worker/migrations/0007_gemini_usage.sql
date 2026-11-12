-- Gemini token/xarajat hisobi (2026-09-23). schema.sql bilan bir xil.
-- Prod: npx wrangler d1 execute tatuziyo-db --remote --file=migrations/0007_gemini_usage.sql
CREATE TABLE IF NOT EXISTS gemini_usage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER,
  stage        TEXT NOT NULL,
  model        TEXT DEFAULT '',
  batch        INTEGER DEFAULT 0,
  audio_in     INTEGER DEFAULT 0,
  text_in      INTEGER DEFAULT 0,
  out_tokens   INTEGER DEFAULT 0,
  usd          REAL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gusage_created ON gemini_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_gusage_rec ON gemini_usage(recording_id);
