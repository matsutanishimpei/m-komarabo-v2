-- 0012_add_issue_requirement_logs.sql
-- 課題テーブルに要件定義ログカラムを追加
ALTER TABLE issues ADD COLUMN requirement_log TEXT;
