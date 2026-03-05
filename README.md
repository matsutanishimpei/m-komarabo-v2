メモ
D1データベースのID: d3ad4a59-fad0-482f-a1f1-8a6d95f026e3
モジュール構成: auth, issues, wakuwaku, admin に分かれていること。
初期衝動の封印: ワクワク試作室のコアコンセプト。


# 松谷の試作室 (Matsutani's Prototyping Studio)

2つの扉を持つ試作プラットフォームです。
Cloudflare Pages と D1 データベース、Hono フレームワークを使用して構築されています。

## 2つの扉

### 🔵 困りごとラボ (Komarabo)
**キャッチ**: 「その悩み、プロトタイプの種になる。」

街の課題（困りごと）を投稿し、共有するためのプラットフォーム。
市民や非ITの方の「不便」を投稿し、解決策を議論する場所です。

### 🎨 ワクワク試作室 (Waku-Waku Lab)
**キャッチ**: 「技術の無駄遣い、大歓迎。」

「誰が使うんだこれ（笑）」という尖ったアプリや、エンジニアの変執的なこだわりが詰まったプロダクトの展示室。

## プロジェクト構造と各ファイルの役割

- `functions/api/[[route]].ts`: APIサーバーの本体（Hono）。ルーティングとビジネスロジックを担当。
- `public/`: 静的ファイル（フロントエンド）を格納するディレクトリ。
  - `index.html`: ランディングページ（2つの扉を選択）
  - `komarabo.html`: 困りごとラボのメインUI。API（`/api/*`）をフェッチしてデータを表示。
  - `wakuwaku.html`: ワクワク試作室のプロダクト展示ページ。
  - `detail.html`: 課題詳細ページ。
  - `login.html`: ログイン/登録ページ。
- `wrangler.toml`: Cloudflare Pages の設定ファイル。ビルド設定やD1データベースの紐付けを行う。
- `package.json`: プロジェクトの依存関係と開発用スクリプトの定義。
- `.gitignore`: Gitの管理対象外ファイルを指定（node_modules, .wranglerなど）。

---

## ルーティングの仕組み (`functions/api/[[route]].ts`)

このプロジェクトでは、Cloudflare Pages の **Functions** 機能を活用しており、Hono を使用した高度なルーティングを行っています。

### `[[route]].ts` (Catch-all Route)
ファイル名を `[[route]].ts` とすることで、`/api/` 以下のすべてのサブパス（例: `/api/issues/list`, `/api/issues/post` など）がこの一つのファイルに集約されます。

```typescript
// functions/api/[[route]].ts
const app = new Hono().basePath('/api')

app.route('/issues', issues) // /api/issues/list や /api/issues/post などに対応
app.route('/wakuwaku', wakuwaku) // /api/wakuwaku/... に対応

export const onRequest = handle(app)
```

この構成により、フロントエンド側は `/api/issues/list` という簡潔なURLでバックエンドを整理された形で呼び出すことが可能です。

---

## データベース接続の仕組み (`D1 Database`)

Cloudflare のサーバーレスSQLデータベース **D1** を使用しています。

### `wrangler.toml` での定義
D1 データベースをコードから参照できるようにするために、`wrangler.toml` にバインディング（接続設定）を記述します。

```toml
[[d1_databases]]
binding = "DB" # コード内で c.env.DB として参照するための名前
database_name = "your-database-name"
database_id = "your-database-id"
```

### コード内での利用
Hono のコンテキストを通じて、バインド名（`DB`）を指定してデータベースを操作します。

```typescript
// SQLの実行例
const { results } = await c.env.DB.prepare('SELECT * FROM issues').all()
```

---

## 開発とデプロイ

### ローカル開発
```bash
npm run dev
```
`wrangler pages dev public` が実行され、ローカルサーバー（http://localhost:8788）が立ち上がります。

### デプロイ
```bash
npm run deploy
```
Cloudflare Pages へプロジェクト全体をデプロイします。

---

## データベースバックアップ

### 自動バックアップ
GitHub Actions により、**毎日 00:00（JST）に D1 データベースを自動エクスポート**しています。  
バックアップファイル（`.sql`）は以下のリポジトリに蓄積されます：

**[matsutanishimpei/m-komarabo-v2-backup](https://github.com/matsutanishimpei/m-komarabo-v2-backup)**

バックアップは `mysqldump` 相当の SQL 形式です。`CREATE TABLE` + `INSERT` が含まれています。

### バックアップの中身を確認する
[DB Browser for SQLite](https://sqlitebrowser.org/) で確認できます。  
`ファイル` → `インポート` → `SQL ファイルからデータベースへ` で読み込んだ後、JOIN クエリを自由に実行できます。

### 復元手順（障害時）
バックアップは**空の D1 に対して流し込む**運用です（二重登録を防ぐため）。

```bash
# リモート（本番）の D1 に復元
npx wrangler d1 execute m-komarabo-v2-db --remote --file=backup_xxx.sql
```
