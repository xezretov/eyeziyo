-- Cleanup: delete all non-admin users (teachers, students) and their data.
-- D1 forbids TEMP tables in batch execution, so we keep everything as
-- inline subqueries against `users.role`. Order is children-first so a
-- partial failure leaves no orphans.

DELETE FROM evaluations
WHERE lesson_id IN (
  SELECT l.id FROM lessons l
  JOIN users u ON l.user_id = u.id
  WHERE u.role != 'admin'
);

DELETE FROM lesson_tests
WHERE lesson_id IN (
  SELECT l.id FROM lessons l
  JOIN users u ON l.user_id = u.id
  WHERE u.role != 'admin'
);

DELETE FROM test_attempts
WHERE student_id IN (SELECT id FROM users WHERE role != 'admin')
   OR lesson_id  IN (
     SELECT l.id FROM lessons l
     JOIN users u ON l.user_id = u.id
     WHERE u.role != 'admin'
   );

DELETE FROM mentor_chats
WHERE student_id IN (SELECT id FROM users WHERE role != 'admin')
   OR lesson_id  IN (
     SELECT l.id FROM lessons l
     JOIN users u ON l.user_id = u.id
     WHERE u.role != 'admin'
   );

DELETE FROM lessons
WHERE user_id IN (SELECT id FROM users WHERE role != 'admin');

DELETE FROM student_groups
WHERE student_id IN (SELECT id FROM users WHERE role != 'admin');

DELETE FROM teacher_groups
WHERE teacher_id IN (SELECT id FROM users WHERE role != 'admin');

DELETE FROM teacher_subjects
WHERE teacher_id IN (SELECT id FROM users WHERE role != 'admin');

UPDATE groups_v2 SET class_teacher_id = NULL
WHERE class_teacher_id IN (SELECT id FROM users WHERE role != 'admin');

DELETE FROM refresh_tokens
WHERE user_id IN (SELECT id FROM users WHERE role != 'admin');

DELETE FROM users WHERE role != 'admin';
