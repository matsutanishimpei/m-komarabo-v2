-- base_prompts テーブルに feature / is_active カラムを追加
-- feature: 'wakuwaku' | 'komarabo' でどの機能向けかを区別
-- is_active: 1=有効, 0=無効（コマラボは1件のみ1にする運用）

ALTER TABLE base_prompts ADD COLUMN feature TEXT NOT NULL DEFAULT 'wakuwaku';
ALTER TABLE base_prompts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- 既存のワクワクプロンプトは feature='wakuwaku', is_active=1 のまま
-- UPDATE は不要（DEFAULT でカバー済み）

-- site_configs にあったコマラボ要件定義プロンプトを base_prompts に移行
INSERT INTO base_prompts (label, prompt, feature, is_active)
SELECT
    'デフォルト要件定義プロンプト' AS label,
    value AS prompt,
    'komarabo' AS feature,
    1 AS is_active
FROM site_configs
WHERE key = 'komarabo_requirement_prompt';

-- 移行後に site_configs から削除
DELETE FROM site_configs WHERE key = 'komarabo_requirement_prompt';
DELETE FROM site_configs WHERE key = 'wakuwaku_base_prompt';
