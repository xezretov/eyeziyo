-- Dars baholashni 5 ta mezonga o'tkazish (har biri 0-20 ball, overall = yig'indi 0-100).
--
-- Eski 3 ta ko'rsatkich (clarity/engagement/content, har biri 0-100) o'rniga:
--   topic_score        — Mavzu mosligi va ilmiy terminologiya
--   speech_score       — Nutq maqsadliligi va akademik tozalik
--   method_score       — Metodik mahorat va tushuntirish uslubi
--   interaction_score  — Interaktivlik va talabalar qamrovi
--   feedback_score     — Baholash va teskari aloqa (Feedback)
-- overall_score endi shu 5 mezon yig'indisi (0-100).

ALTER TABLE evaluations ADD COLUMN topic_score INTEGER DEFAULT 0;
ALTER TABLE evaluations ADD COLUMN speech_score INTEGER DEFAULT 0;
ALTER TABLE evaluations ADD COLUMN method_score INTEGER DEFAULT 0;
ALTER TABLE evaluations ADD COLUMN interaction_score INTEGER DEFAULT 0;
ALTER TABLE evaluations ADD COLUMN feedback_score INTEGER DEFAULT 0;

-- Eski ma'lumotlarni yangi mezonlarga moslashtirish: eski sub-ballarni (0-100)
-- 0-20 shkalaga keltiramiz va overall'ni ularning yig'indisi qilib qayta hisoblaymiz.
UPDATE evaluations SET
  topic_score       = CAST(ROUND(content_score    / 5.0) AS INTEGER),
  method_score      = CAST(ROUND(clarity_score    / 5.0) AS INTEGER),
  speech_score      = CAST(ROUND(clarity_score    / 5.0) AS INTEGER),
  interaction_score = CAST(ROUND(engagement_score / 5.0) AS INTEGER),
  feedback_score    = CAST(ROUND(engagement_score / 5.0) AS INTEGER);

UPDATE evaluations SET
  overall_score = topic_score + speech_score + method_score + interaction_score + feedback_score;

-- Eski ustunlarni olib tashlash (D1/SQLite 3.35+ DROP COLUMN'ni qo'llab-quvvatlaydi).
ALTER TABLE evaluations DROP COLUMN clarity_score;
ALTER TABLE evaluations DROP COLUMN engagement_score;
ALTER TABLE evaluations DROP COLUMN content_score;
