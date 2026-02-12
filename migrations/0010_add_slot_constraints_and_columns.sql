-- 0010_add_slot_constraints_and_columns.sql

-- 1. Create slot_constraints table
CREATE TABLE IF NOT EXISTS slot_constraints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    content TEXT NOT NULL
);

-- 2. Insert initial data
INSERT OR IGNORE INTO slot_constraints (category, content) VALUES
('Constraint', '動作環境は「IE6」'),
('Constraint', '入力デバイスは「マイク」のみ'),
('Constraint', '画面サイズは「32x32ピクセル」'),
('Constraint', '言語は「アセンブリ」禁止（逆に高級言語縛りなど）'),
('Theme', '「猫」に見せるためだけのUI'),
('Theme', '「トイレ」でしか使えないアプリ'),
('Theme', '「寝落ち」を阻害しないアラーム'),
('Tech', 'WebGLで「テキストエディタ」'),
('Tech', 'CSSだけで「FPS」'),
('Tech', 'Excel方眼紙を「データベース」として活用');

-- 3. Add columns to products table
-- SQLite does not support multiple ADD COLUMN in one statement standardly, so we separate them.
ALTER TABLE products ADD COLUMN catch_copy TEXT;     -- 一言キャッチコピー
ALTER TABLE products ADD COLUMN protocol_log TEXT;   -- 仕様書（プロトコル）
ALTER TABLE products ADD COLUMN dialogue_log TEXT;   -- 対話ログ
