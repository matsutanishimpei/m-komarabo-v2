-- 0008_rebuild_schema.sql
-- ER図に基づいてデータベースを再構築します。既存のデータは失われます。

-- コメントテーブル（issue_id, user_id に依存）
DROP TABLE IF EXISTS comments;

-- 証明書テーブル（issue_id, developer_id に依存）
DROP TABLE IF EXISTS certificates;

-- 課題テーブル（requester_id, developer_id に依存）
DROP TABLE IF EXISTS issues;

-- ユーザーテーブル（依存先なし）
DROP TABLE IF EXISTS users;

-- ==========================================
-- USERS テーブル
-- ==========================================
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_hash TEXT NOT NULL UNIQUE,      -- ユーザー識別ハッシュ (ログインID)
    password_hash TEXT,                  -- パスワードハッシュ
    role TEXT DEFAULT 'requester',       -- 役割 (requester/developer)
    total_score INTEGER DEFAULT 0,       -- 合計スコア
    is_admin INTEGER DEFAULT 0,          -- 管理者フラグ (0: 一般, 1: 管理者)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP -- 作成日時
);

-- ==========================================
-- ISSUES テーブル
-- ==========================================
CREATE TABLE issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,       -- 依頼者ID (users.id)
    title TEXT NOT NULL,                 -- 困りごと題名
    description TEXT,                    -- 詳細内容
    status TEXT DEFAULT 'open',          -- ステータス (open/progress/closed)
    github_url TEXT,                     -- GitHub連携URL
    developer_id INTEGER,                -- 着手開発者ID (users.id)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 投稿日時
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (developer_id) REFERENCES users(id)
);

-- ==========================================
-- CERTIFICATES テーブル
-- ==========================================
CREATE TABLE certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,           -- 困りごとID (issues.id)
    developer_id INTEGER NOT NULL,       -- 開発者ID (users.id)
    verification_key TEXT,               -- 検証キー
    valuation_score INTEGER DEFAULT 0,   -- 評価数
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (developer_id) REFERENCES users(id)
);

-- ==========================================
-- COMMENTS テーブル
-- ==========================================
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,           -- 困りごとID (issues.id)
    user_id INTEGER NOT NULL,            -- 投稿者ID (users.id)
    content TEXT NOT NULL,               -- コメント内容
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 投稿日時
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- インデックス作成（パフォーマンス用）
CREATE INDEX idx_issues_requester_id ON issues(requester_id);
CREATE INDEX idx_issues_developer_id ON issues(developer_id);
CREATE INDEX idx_comments_issue_id ON comments(issue_id);
