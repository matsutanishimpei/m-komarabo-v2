-- 0009_add_wakuwaku_tables.sql
-- ワクワク試作室用のテーブルを追加します。

-- ==========================================
-- PRODUCTS テーブル
-- ==========================================
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,          -- 作成者ID (users.id)
    title TEXT NOT NULL,                  -- プロダクト名
    url TEXT,                             -- プロダクトURL (任意)
    initial_prompt_log TEXT,              -- 初期衝動履歴 (プロンプトログ)
    dev_obsession TEXT,                   -- 開発の変執 (こだわり)
    status TEXT DEFAULT 'published',      -- ステータス (published/draft等)
    sealed_at DATETIME,                   -- 封印日時 (作成日時と同じだが、概念的に分ける)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 作成日時
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 更新日時
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_products_creator_id ON products(creator_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- ==========================================
-- SITE_CONFIGS テーブル
-- ==========================================
CREATE TABLE IF NOT EXISTS site_configs (
    key TEXT PRIMARY KEY,                 -- 設定キー
    value TEXT,                           -- 設定値
    description TEXT,                     -- 説明
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初期データ投入 (ワクワク試作室のベースプロンプト)
INSERT OR IGNORE INTO site_configs (key, value, description) 
VALUES ('wakuwaku_base_prompt', 'あなたはマッドサイエンティストです。ユーザーのアイデアを極限まで尖らせてください。', 'ワクワク試作室のAI人格設定');
