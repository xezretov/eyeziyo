-- Rate limiting + index improvements
-- Buckets identified by (key, window_start) where window_start is epoch seconds
-- truncated to the bucket size. Old rows are GC'd opportunistically by
-- the worker, so we don't need a scheduled job.

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON rate_limits(window_start);

-- Frequently queried indexes for hot paths
CREATE INDEX IF NOT EXISTS idx_lessons_user_id
  ON lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_user_created
  ON lessons(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_lesson_id
  ON evaluations(lesson_id);
CREATE INDEX IF NOT EXISTS idx_users_role_inst
  ON users(role, institution_id);

-- Refresh-token rotation: store the JTI of every refresh token we issue,
-- mark it used the first time it's redeemed. Refresh-replay = reject.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
  ON refresh_tokens(expires_at);
