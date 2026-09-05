-- v2 ga o'tish, 3-qadam: admin foydalanuvchilarni yangi users jadvaliga ko'chirish.
INSERT INTO users (email, password_hash, name, role, avatar, active, created_at)
SELECT email, password_hash, name, role, upper(substr(name, 1, 1)), active, created_at FROM users_v1;
DROP TABLE users_v1;
