-- 0013_add_base_prompts_table.sql

-- 1. Create base_prompts table
CREATE TABLE IF NOT EXISTS base_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrate existing base prompt from site_configs
INSERT INTO base_prompts (label, prompt)
SELECT '標準 (Standard)', value 
FROM site_configs 
WHERE key = 'wakuwaku_base_prompt';

-- If no existing prompt, insert a default one
INSERT INTO base_prompts (label, prompt)
SELECT '標準 (Standard)', 'あなたはマッドサイエンティストです。ユーザーのアイデアを極限まで尖らせてください。'
WHERE NOT EXISTS (SELECT 1 FROM base_prompts);
