-- 0014_google_oauth_users.sql
-- Google OAuth対応: usersテーブルと関連テーブルを再構築
-- ※ D1はPRAGMA foreign_keys=OFFが効かないため、RENAMEで退避

-- 1. 既存テーブルをリネームして退避（FK参照があるテーブル全て）
ALTER TABLE products RENAME TO _old_products;
ALTER TABLE comments RENAME TO _old_comments;
ALTER TABLE certificates RENAME TO _old_certificates;
ALTER TABLE issues RENAME TO _old_issues;
ALTER TABLE users RENAME TO _old_users;

-- 2. 旧インデックスを削除
DROP INDEX IF EXISTS idx_google_sub;
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_issues_requester_id;
DROP INDEX IF EXISTS idx_issues_developer_id;
DROP INDEX IF EXISTS idx_comments_issue_id;
DROP INDEX IF EXISTS idx_products_creator_id;
DROP INDEX IF EXISTS idx_products_status;

-- 3. 新しい users テーブル
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'student',
  is_active INTEGER DEFAULT 1,
  is_profile_completed BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_google_sub ON users(google_sub);
CREATE INDEX idx_users_email ON users(email);

-- 4. issues テーブル再作成
CREATE TABLE issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open',
    github_url TEXT,
    developer_id TEXT,
    requirement_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (developer_id) REFERENCES users(id)
);

CREATE INDEX idx_issues_requester_id ON issues(requester_id);
CREATE INDEX idx_issues_developer_id ON issues(developer_id);

-- 5. comments テーブル再作成
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_comments_issue_id ON comments(issue_id);

-- 6. certificates テーブル再作成
CREATE TABLE certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    developer_id TEXT NOT NULL,
    verification_key TEXT,
    valuation_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (developer_id) REFERENCES users(id)
);

-- 7. products テーブル再作成（creator_id を TEXT UUIDに変更）
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    initial_prompt_log TEXT,
    dev_obsession TEXT,
    status TEXT DEFAULT 'published',
    sealed_at DATETIME,
    catch_copy TEXT,
    protocol_log TEXT,
    dialogue_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

CREATE INDEX idx_products_creator_id ON products(creator_id);
CREATE INDEX idx_products_status ON products(status);
