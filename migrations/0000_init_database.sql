-- 既存のすべてのテーブルを削除（ゴミデータのクリーニングと初期化）
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS issues;
DROP TABLE IF EXISTS logs;
DROP TABLE IF EXISTS _old_comments;
DROP TABLE IF EXISTS _old_certificates;
DROP TABLE IF EXISTS _old_products;
DROP TABLE IF EXISTS _old_issues;
DROP TABLE IF EXISTS _old_users;
DROP TABLE IF EXISTS slot_constraints;
DROP TABLE IF EXISTS base_prompts;
DROP TABLE IF EXISTS site_configs;
DROP TABLE IF EXISTS users;

-- Users (Google OAuth + UUID)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  is_active INTEGER DEFAULT 1,
  is_profile_completed BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Issues (困りごと投稿)
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

-- Comments (課題のコメント)
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Certificates (課題解決証明)
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

-- Products (ワクワク試作室のプロダクト)
CREATE TABLE products (
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

-- Site Configs (プロンプトや各種設定)
CREATE TABLE site_configs (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Slot Constraints (ワクワク試作室のIdeationガチャ制約)
CREATE TABLE slot_constraints ( 
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    category TEXT NOT NULL, 
    content TEXT NOT NULL 
);

-- Base Prompts (ワクワク試作室のベースプロンプト)
CREATE TABLE base_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Logs (旧AI対話ログ - 必要に応じて)
CREATE TABLE logs (
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
-- 初期マスターデータの投入 (シードデータ)
-- ==========================================

-- 1. Site Configs
INSERT INTO site_configs (key, value, description) VALUES
('komarabo_requirement_prompt', 'あなたは優秀なシステムエンジニアです。入力された「困りごと」から、解決のためのシステム要件を箇条書きで定義してください。', 'コマラボの課題投稿時に自動で要件定義を行うためのシステムプロンプト'),
('wakuwaku_base_prompt', 'あなたは独創的で面白いプロトタイプ開発を支援する天才ハッカー的メンターです。', 'ワクワク試作室のデフォルトシステムプロンプト');

-- 2. Base Prompts
INSERT INTO base_prompts (label, prompt) VALUES
('社会課題解決', 'あなたはソーシャルアントレプレナー（社会起業家）です。提供された制約を活かしながら、SDGsや地域社会の課題を解決する、少し真面目だけど革新的なアプリのアイデアを出してください。'),
('エンタメ・バカアプリ', 'あなたは「誰が使うんだこれ（笑）」と言われるような、無駄を楽しむ天才クリエイターです。提供された制約だけを使って、全く役に立たないけれど最高に笑える、尖りまくったウェブアプリのアイデアを提案してください。'),
('超・技術特化', 'あなたは最新技術の限界に挑戦する変態エンジニアです。提供された制約をもとに、オーバーエンジニアリングや無駄に高度な技術を使った、ロマンあふれるプロトタイプのアイデアを出してください。');

-- 3. Slot Constraints
INSERT INTO slot_constraints (category, content) VALUES
('技術制約', 'CSSアニメーションのみでUIを実装する'),
('技術制約', 'JavaScriptを一切使わない'),
('技術制約', 'WebGLを無駄にふんだんに使う'),
('技術制約', '通信にWebSocketsのみ使用する'),
('ターゲット', 'おばあちゃん専用'),
('ターゲット', '猫用'),
('ターゲット', '絶対に怒っている人向け'),
('ターゲット', '睡眠中の人向け'),
('デザイン', 'すべて白黒 (モノクローム)'),
('デザイン', '90年代のインターネット風'),
('デザイン', 'めちゃくちゃ文字が小さい'),
('デザイン', 'ネオンカラーのみ');

-- 4. サンプルユーザーの投入 (管理者の例)
-- パスワードなどのハッシュを含まないGoogle認証向けダミーユーザー
INSERT INTO users (id, google_sub, email, display_name, avatar_url, role, is_active, is_profile_completed) VALUES
('sample-admin-uuid-001', 'google-oauth-sub-demo-001', 'admin@example.com', '管理者 (Admin)', '', 'admin', 1, 1),
('sample-user-uuid-002', 'google-oauth-sub-demo-002', 'user@example.com', 'サンプルの非IT市民', '', 'user', 1, 1),
('sample-dev-uuid-003', 'google-oauth-sub-demo-003', 'dev@example.com', 'サンプル開発者', '', 'user', 1, 1);

-- 5. サンプル課題の投入
INSERT INTO issues (requester_id, title, description, status, requirement_log) VALUES
('sample-user-uuid-002', '家の前のゴミステーションがカラスに荒らされる', '毎週カラスにやられて困っています。なんとかITの力で解決できませんか？', 'open', '【システム要件】\n1. AIカメラでカラスを検知する機能\n2. 検知時に警告音を鳴らすスピーカー連携\n3. 近隣住民への通知機能 (LINE ボット等)'),
('sample-user-uuid-002', '回覧板を回すのが面倒くさい', '誰が止めているか分からないし、雨の日は濡れます。', 'progress', '【システム要件】\n1. クラウドベースのデジタル回覧板アプリ\n2. 既読スルー防止のトラッキング機能');

-- 進行中の課題に担当者を割り当て
UPDATE issues SET developer_id = 'sample-dev-uuid-003' WHERE title LIKE '回覧板%';

-- 6. サンプルプロダクト(作品)の投入
INSERT INTO products (creator_id, title, status, catch_copy, protocol_log, dialogue_log) VALUES
('sample-dev-uuid-003', 'Angry Text Reader', 'published', '絶対に怒っている文章しか読めないリーダー', '# 仕様\n- フォントは全部赤\n- 句点が強制的に「！」になる', 'User: 怒ってる人向けのアプリ作って\nAI: 赤くてデカい文字にするぜ！'),
('sample-admin-uuid-001', 'Neo-Retro Web', 'published', '90年代のウェブを現代の技術で再現', '# 仕様\n- marqueeタグをWebGLで実装\n- カーソルに星が追従する\n- BGMが勝手に鳴る', 'User: 90年代風にしたい\nAI: MIDIサウンドと点滅するテキストだ！');
