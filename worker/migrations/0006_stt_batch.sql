-- Gemini Batch STT (2026-09-22): job nomi va yuborilgan vaqt. schema.sql bilan bir xil.
-- Prod: npx wrangler d1 execute tatuziyo-db --remote --file=migrations/0006_stt_batch.sql
ALTER TABLE recordings ADD COLUMN batch_name TEXT DEFAULT '';
ALTER TABLE recordings ADD COLUMN batch_submitted_at TIMESTAMP;
