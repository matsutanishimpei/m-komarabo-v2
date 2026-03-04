-- ==========================================
-- m-komarabo-v2 チE�Eタベ�Eス初期化スクリプト
-- ==========================================
-- こ�Eファイルが単一の正とする定義、E
-- base_prompts・slot_constraints は運用チE�Eタを反映、E
-- ==========================================

-- ==========================================
-- チE�Eブル定義
-- ==========================================

-- Users (Google OAuth + UUID)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',          -- 'user' | 'admin'
  is_active INTEGER DEFAULT 1,       -- 0: 無効匁E 1: 有効
  is_profile_completed BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Issues (困りごとラボ�E課題投稿)
CREATE TABLE issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open',       -- 'open' | 'progress' | 'closed'
    github_url TEXT,
    developer_id TEXT,
    requirement_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (developer_id) REFERENCES users(id)
);

-- Comments (課題�EコメンチE
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Certificates (課題解決証昁E
CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    developer_id TEXT NOT NULL,
    verification_key TEXT,
    valuation_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (developer_id) REFERENCES users(id)
);

-- Products (ワクワク試作室のプロダクチE
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    initial_prompt_log TEXT,
    dev_obsession TEXT,
    status TEXT DEFAULT 'draft',
    sealed_at DATETIME,
    catch_copy TEXT,
    protocol_log TEXT,
    dialogue_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- Slot Constraints (ワクワク試作室のIdeationガチャ制紁E
CREATE TABLE IF NOT EXISTS slot_constraints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    content TEXT NOT NULL
);

-- Base Prompts (ワクワク試作室・困りごとラボ�E吁E��プロンプト管琁E
CREATE TABLE IF NOT EXISTS base_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    feature TEXT NOT NULL DEFAULT 'wakuwaku',   -- 'wakuwaku' | 'komarabo'
    is_active INTEGER NOT NULL DEFAULT 1,        -- 0: 無効, 1: 有効
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Logs (旧AI対話ログ)
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  mode TEXT NOT NULL,
  temperature TEXT,
  title TEXT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES logs (id)
);

-- ==========================================
-- 初期マスターチE�Eタ (シードデータ)
-- ==========================================

-- 1. Base Prompts�E�ワクワク用 + コマラボ用�E�E
-- ※ 実際の運用チE�Eタを反映
