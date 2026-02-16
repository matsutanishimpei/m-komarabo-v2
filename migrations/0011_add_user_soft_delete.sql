-- 0011_add_user_soft_delete.sql
-- ユーザーの論理削除カラムを追加

ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
-- is_active: 1 = 有効, 0 = 無効（論理削除）
