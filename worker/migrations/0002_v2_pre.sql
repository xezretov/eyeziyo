-- v2 (eyeziyo admin sxemasi) ga o'tish, 1-qadam: eski jadvallarni olib tashlash.
-- users saqlanadi (users_v1), keyin schema.sql, keyin 0002_v2_post.sql.
ALTER TABLE users RENAME TO users_v1;
DROP TABLE IF EXISTS processing_events;
DROP TABLE IF EXISTS transcripts;
DROP TABLE IF EXISTS analyses;
DROP TABLE IF EXISTS recordings;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS rate_limits;
