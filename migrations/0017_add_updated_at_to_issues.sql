-- issues テーブルに updated_at カラムを追加
-- ソート・放置検知・最終活動日時の把握に使用

ALTER TABLE issues ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 既存レコードは created_at を初期値として使用
UPDATE issues SET updated_at = created_at;
