-- Read-only preview: how many rows would the cleanup delete?
-- Safe to run; no writes.

SELECT 'users (will keep admins)' AS scope,
       SUM(CASE WHEN role  = 'admin' THEN 1 ELSE 0 END) AS keep_admin,
       SUM(CASE WHEN role  = 'teacher' THEN 1 ELSE 0 END) AS delete_teacher,
       SUM(CASE WHEN role  = 'student' THEN 1 ELSE 0 END) AS delete_student,
       SUM(CASE WHEN role NOT IN ('admin','teacher','student') THEN 1 ELSE 0 END) AS delete_other
FROM users;

SELECT 'lessons (delete)' AS scope, COUNT(*) AS cnt
FROM lessons l JOIN users u ON l.user_id = u.id
WHERE u.role != 'admin';

SELECT 'evaluations (delete)' AS scope, COUNT(*) AS cnt
FROM evaluations e
WHERE e.lesson_id IN (SELECT l.id FROM lessons l JOIN users u ON l.user_id = u.id WHERE u.role != 'admin');

SELECT 'lesson_tests (delete)' AS scope, COUNT(*) AS cnt
FROM lesson_tests lt
WHERE lt.lesson_id IN (SELECT l.id FROM lessons l JOIN users u ON l.user_id = u.id WHERE u.role != 'admin');

SELECT 'test_attempts (delete)' AS scope, COUNT(*) AS cnt
FROM test_attempts
WHERE student_id IN (SELECT id FROM users WHERE role != 'admin')
   OR lesson_id  IN (SELECT l.id FROM lessons l JOIN users u ON l.user_id = u.id WHERE u.role != 'admin');

SELECT 'mentor_chats (delete)' AS scope, COUNT(*) AS cnt
FROM mentor_chats
WHERE student_id IN (SELECT id FROM users WHERE role != 'admin')
   OR lesson_id  IN (SELECT l.id FROM lessons l JOIN users u ON l.user_id = u.id WHERE u.role != 'admin');

SELECT 'student_groups (delete)' AS scope, COUNT(*) AS cnt
FROM student_groups WHERE student_id IN (SELECT id FROM users WHERE role != 'admin');

SELECT 'teacher_groups (delete)' AS scope, COUNT(*) AS cnt
FROM teacher_groups WHERE teacher_id IN (SELECT id FROM users WHERE role != 'admin');

SELECT 'teacher_subjects (delete)' AS scope, COUNT(*) AS cnt
FROM teacher_subjects WHERE teacher_id IN (SELECT id FROM users WHERE role != 'admin');

SELECT 'groups_v2 (will null class_teacher)' AS scope, COUNT(*) AS cnt
FROM groups_v2 WHERE class_teacher_id IN (SELECT id FROM users WHERE role != 'admin');

SELECT 'refresh_tokens (delete)' AS scope, COUNT(*) AS cnt
FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE role != 'admin');
