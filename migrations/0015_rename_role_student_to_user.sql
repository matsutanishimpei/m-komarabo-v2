-- ロール名の変更: 'student' → 'user'
-- 学生専用ではなく一般ユーザーを表す汎用的な名称に統一

UPDATE users SET role = 'user' WHERE role = 'student';
