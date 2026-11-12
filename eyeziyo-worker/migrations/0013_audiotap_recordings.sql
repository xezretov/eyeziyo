-- Audiotap webhook integration: every `recording.available` delivery is
-- persisted here (one row per artifact) and the audio itself is downloaded
-- into R2 (see src/audiotap.ts).
--
-- status flow: received -> downloading -> stored | failed

CREATE TABLE IF NOT EXISTS audiotap_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,              -- CloudEvent id (dedup with profile)
  recording_id TEXT NOT NULL,          -- audiotap recording uuid
  event_type TEXT NOT NULL DEFAULT 'recording.available',
  source_name TEXT DEFAULT '',         -- audio_source.name (e.g. "office")
  schedule_name TEXT DEFAULT '',
  profile TEXT DEFAULT '',             -- artifact profile: speech | original | ...
  codec TEXT DEFAULT '',               -- opus | flac
  container TEXT DEFAULT '',           -- ogg | flac
  size_bytes INTEGER DEFAULT 0,
  duration_seconds REAL DEFAULT 0,
  checksum_sha256 TEXT DEFAULT '',
  download_url TEXT DEFAULT '',        -- as delivered (host rewritten at fetch time)
  started_at TEXT DEFAULT '',
  finalized_at TEXT DEFAULT '',
  completeness TEXT DEFAULT '',        -- complete | partial
  gap_seconds_total REAL DEFAULT 0,
  status TEXT DEFAULT 'received',      -- received | downloading | stored | failed
  r2_key TEXT DEFAULT '',              -- object key in AUDIO_BUCKET once stored
  error TEXT DEFAULT '',
  payload TEXT DEFAULT '',             -- full raw webhook JSON for audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audiotap_event_profile
  ON audiotap_recordings(event_id, profile);
CREATE INDEX IF NOT EXISTS idx_audiotap_recording
  ON audiotap_recordings(recording_id);
CREATE INDEX IF NOT EXISTS idx_audiotap_status
  ON audiotap_recordings(status);
