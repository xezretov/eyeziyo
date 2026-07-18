-- Default evaluation questions (institution-wide, no subject scope).
-- Admin can edit/delete or add subject-specific ones from the panel.
INSERT INTO evaluation_questions (institution_id, subject_id, text, scale, sort_order)
VALUES
  (1, NULL, 'O''qituvchining mavzuni tushuntirish darajasini baholang', 5, 1),
  (1, NULL, 'Savol berish va talaba bilan muloqot darajasini baholang', 5, 2),
  (1, NULL, 'Misollar va amaliy mashqlarning mosligi', 5, 3),
  (1, NULL, 'Darsning umumiy foydaliligi', 5, 4),
  (1, NULL, 'Vaqtni boshqarish va tezlik', 5, 5);
