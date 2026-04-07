-- 管理者フラグを追加 (既に存在するためコメントアウト)
-- ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;

-- matsutanishinpei を管理者に設定
UPDATE users SET is_admin = 1 WHERE user_hash = 'matsutanishinpei';
