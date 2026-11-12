-- Dars jarayoni: ovoz manbalari statistikasi va bosqichlar (2026-09-28). schema.sql bilan bir xil.
-- Prod: npx wrangler d1 execute tatuziyo-db --remote --file=migrations/0008_lesson_timeline.sql
ALTER TABLE transcripts ADD COLUMN stats TEXT DEFAULT '';
ALTER TABLE evaluations ADD COLUMN timeline TEXT DEFAULT '';
