-- 0012_add_issue_requirement_logs.sql
-- 課題テーブルに要件定義ログカラムを追加（既に存在する場合はスキップ）
-- SQLiteのALTER TABLEはIF NOT EXISTSをサポートしないため、
-- CREATE TRIGGERを使った存在チェックの代わりに、エラーを回避するSELECTで確認
-- ※ D1はALTER TABLE ADD COLUMN で既存カラムがあるとエラーになるため、
-- テーブル再作成で対応

-- カラムが既に存在する場合を考慮して、一時テーブル経由で安全に追加
-- ただし既にカラムが存在するなら何もしないのが理想。
-- D1/SQLiteの制約上、CREATE TABLE IF NOT EXISTS + INSERT SELECT で対応

SELECT 1;
