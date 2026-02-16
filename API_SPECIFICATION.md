# API 仕様書

**プロジェクト:** m-komarabo-v2 (Matsutani Prototyping Studio)  
**ベースURL:** `/api`  
**フレームワーク:** Hono (Cloudflare Workers)  
**データベース:** Cloudflare D1  
**最終更新日:** 2026-02-16

---

## 目次

1. [共通仕様](#共通仕様)
2. [認証 API (`/api/auth`)](#認証-api-apiauth)
3. [コマラボ API (`/api/issues`)](#コマラボ-api-apiissues)
4. [ワクワク試作室 API (`/api/wakuwaku`)](#ワクワク試作室-api-apiwakuwaku)
5. [管理者 API (`/api/admin`)](#管理者-api-apiadmin)
6. [エラーハンドリング](#エラーハンドリング)
7. [データモデル](#データモデル)

---

## 共通仕様

### 認証方式

現在の認証は `user_hash`（ユーザー識別子）をリクエストに含める方式です。

- **POSTリクエスト:** `user_hash` をリクエストボディ（JSON）に含める
- **GETリクエスト:** `user_hash` をクエリパラメータとして付与

> ⚠️ `auth_token` は現在ダミー値であり、検証されていません（将来JWT化予定）

### レスポンス形式

すべてのレスポンスはJSON形式です。

**成功時（一般的なパターン）:**
```json
{
  "success": true,
  "message": "操作が完了しました"
}
```

**エラー時:**
```json
{
  "success": false,
  "message": "エラーの説明（汎用メッセージ）"
}
```

### HTTPステータスコード

| コード | 意味 |
|--------|------|
| `200` | 成功 |
| `400` | リクエスト不正（パラメータ不足等） |
| `401` | 認証失敗（パスワード不一致等） |
| `403` | 権限不足 |
| `404` | リソースが見つからない |
| `500` | サーバーエラー |

---

## 認証 API (`/api/auth`)

### `POST /api/auth/login`

ログインまたは自動新規登録を行います。指定された `user_hash` が存在しない場合は自動的に新規登録されます。

**リクエスト:**
```json
{
  "user_hash": "string（ユーザー識別子）",
  "password": "string（平文パスワード、サーバー側でSHA-256ハッシュ化）"
}
```

**レスポンス（ログイン成功）:**
```json
{
  "success": true,
  "isNew": false,
  "message": "ログインしました",
  "user_hash": "abc12345...",
  "is_admin": 0,
  "auth_token": "dummy_token_1708012345678"
}
```

**レスポンス（新規登録）:**
```json
{
  "success": true,
  "isNew": true,
  "message": "新規登録・ログインしました",
  "user_hash": "abc12345...",
  "is_admin": 0,
  "auth_token": "dummy_token_1708012345678"
}
```

**エラーレスポンス:**

| ステータス | 条件 |
|------------|------|
| `401` | パスワードが違います |
| `500` | 登録に失敗しました |

---

## コマラボ API (`/api/issues`)

### `GET /api/issues/list`

課題（悩み事）の一覧を取得します。

**クエリパラメータ:**

| パラメータ | 必須 | 説明 |
|------------|------|------|
| `filter` | いいえ | `all`（デフォルト）または `mine`（自分の投稿のみ） |
| `user_hash` | `filter=mine` の場合必須 | ユーザー識別子 |

**レスポンス:**
```json
[
  {
    "id": 1,
    "requester_id": 3,
    "title": "画面がフリーズする",
    "description": "ボタンを押すと...",
    "status": "open",
    "developer_id": null,
    "created_at": "2026-02-16T10:00:00.000Z",
    "user_hash": "abc12345...",
    "developer_user_hash": null
  }
]
```

**`status` の値:**

| 値 | 意味 |
|----|------|
| `open` | 未着手（挙手待ち） |
| `progress` | 着手中 |
| `closed` | 解決済み |

---

### `POST /api/issues/post`

新しい課題を投稿します。

**リクエスト:**
```json
{
  "title": "string（課題タイトル）",
  "description": "string（課題の説明）",
  "user_hash": "string（投稿者のユーザー識別子）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "投稿完了しました！"
}
```

**エラー:**

| ステータス | 条件 |
|------------|------|
| `404` | ユーザーが見つかりません |

---

### `POST /api/issues/update-status`

課題のステータスを更新します。着手は誰でも可能です。

**リクエスト:**
```json
{
  "id": "number（課題ID）",
  "status": "string（'progress' | 'closed'）",
  "user_hash": "string（操作者、progressの場合のみ使用）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "ステータスを progress に更新しました"
}
```

**備考:**
- `status: "progress"` の場合、`user_hash` のユーザーが `developer_id` として登録されます
- `status: "closed"` の場合、ステータスのみ更新されます

---

### `POST /api/issues/unassign`

着手をキャンセル（挙手を下ろす）します。**担当者本人のみ操作可能**です。

**リクエスト:**
```json
{
  "id": "number（課題ID）",
  "user_hash": "string（操作者のユーザー識別子）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "挙手を下ろしました"
}
```

**エラー:**

| ステータス | 条件 |
|------------|------|
| `400` | user_hash が必要です |
| `403` | 担当者本人のみ挙手を下ろせます |
| `404` | ユーザー / 課題が見つかりません |

---

### `GET /api/issues/detail`

課題の詳細情報（コメント含む）を取得します。

**クエリパラメータ:**

| パラメータ | 必須 | 説明 |
|------------|------|------|
| `id` | はい | 課題ID |

**レスポンス:**
```json
{
  "issue": {
    "id": 1,
    "requester_id": 3,
    "title": "画面がフリーズする",
    "description": "ボタンを押すと...",
    "status": "progress",
    "developer_id": 5,
    "created_at": "2026-02-16T10:00:00.000Z",
    "requester_user_hash": "abc12345...",
    "developer_user_hash": "def67890..."
  },
  "comments": [
    {
      "id": 1,
      "issue_id": 1,
      "user_id": 3,
      "content": "再現手順です...",
      "created_at": "2026-02-16T11:00:00.000Z",
      "user_hash": "abc12345..."
    }
  ]
}
```

---

### `POST /api/issues/comment`

課題にコメントを投稿します。

**リクエスト:**
```json
{
  "issue_id": "number（課題ID）",
  "content": "string（コメント内容）",
  "user_hash": "string（投稿者のユーザー識別子）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "コメントを投稿しました"
}
```

---

### `POST /api/issues/delete`

課題を削除します。**投稿者本人かつ未着手の課題のみ削除可能**です。

**リクエスト:**
```json
{
  "id": "number（課題ID）",
  "user_hash": "string（操作者のユーザー識別子）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "課題を削除しました"
}
```

**エラー:**

| ステータス | 条件 |
|------------|------|
| `400` | 着手済みの課題は削除できません |
| `403` | 自分の投稿のみ削除できます |
| `404` | 課題が見つかりません |

**備考:** 削除時、関連するコメントも同時に削除されます。

---

## ワクワク試作室 API (`/api/wakuwaku`)

### `GET /api/wakuwaku/version`

APIバージョンを返します（デバッグ用）。

**レスポンス:**
```json
{
  "version": "2026-02-16-v4-fixed"
}
```

---

### `GET /api/wakuwaku/base-prompt`

管理者が設定したベースプロンプトを取得します。認証不要。

**レスポンス:**
```json
{
  "success": true,
  "prompt": "あなたはプロトタイプ開発のメンターです..."
}
```

---

### `GET /api/wakuwaku/constraints/random`

ランダムな制約スロットを1件取得します。認証不要。

**レスポンス:**
```json
{
  "id": 3,
  "category": "技術制約",
  "content": "CSSアニメーションだけで実装する"
}
```

---

### `POST /api/wakuwaku/drafts`

新しいドラフト（下書き）を作成します。

**リクエスト:**
```json
{
  "title": "string（プロダクト名）",
  "user_hash": "string（作成者のユーザー識別子）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "id": 42
}
```

---

### `GET /api/wakuwaku/drafts`

自分のドラフト一覧を取得します。

**クエリパラメータ:**

| パラメータ | 必須 | 説明 |
|------------|------|------|
| `user_hash` | はい | ユーザー識別子 |

**レスポンス:**
```json
[
  {
    "id": 42,
    "creator_id": 3,
    "title": "マイアプリ",
    "status": "draft",
    "url": null,
    "dev_obsession": null,
    "protocol_log": null,
    "dialogue_log": null,
    "catch_copy": null,
    "sealed_at": null,
    "created_at": "2026-02-16T10:00:00.000Z",
    "updated_at": "2026-02-16T10:00:00.000Z"
  }
]
```

---

### `POST /api/wakuwaku/drafts/save`

ドラフトを保存（更新）します。**投稿者本人のみ操作可能**です。

**リクエスト:**
```json
{
  "id": "number（プロダクトID）",
  "user_hash": "string（操作者のユーザー識別子）",
  "url": "string | null（プロダクトURL）",
  "dev_obsession": "string | null（こだわりポイント）",
  "protocol_log": "string | null（仕様書・プロトコルログ）",
  "dialogue_log": "string | null（AI対話ログ）",
  "catch_copy": "string | null（キャッチコピー）"
}
```

**レスポンス:**
```json
{
  "success": true
}
```

**エラー:**

| ステータス | 条件 |
|------------|------|
| `400` | IDが無効です |
| `403` | 権限がありません |

---

### `POST /api/wakuwaku/seal`

ドラフトを封印（公開）します。**投稿者本人のみ操作可能**です。

**リクエスト:**
```json
{
  "id": "number（プロダクトID）",
  "user_hash": "string（操作者のユーザー識別子）",
  "protocol_log": "string（仕様書・プロトコルログ）★必須",
  "dialogue_log": "string（AI対話ログ）★必須",
  "catch_copy": "string | null（キャッチコピー）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "封印完了"
}
```

**エラー:**

| ステータス | 条件 |
|------------|------|
| `400` | 仕様書と対話ログは必須です |
| `403` | 権限がありません |

**備考:** 封印により `status` が `'published'` に、`sealed_at` が現在日時に設定されます。

---

### `GET /api/wakuwaku/products`

公開済みプロダクトの一覧を取得します。認証不要。封印日の降順で返されます。

**レスポンス:**
```json
[
  {
    "id": 42,
    "creator_id": 3,
    "title": "マイアプリ",
    "status": "published",
    "url": "https://example.com",
    "dev_obsession": "レスポンシブ対応にこだわった",
    "protocol_log": "1. 要件定義...",
    "dialogue_log": "User: こんにちは...",
    "catch_copy": "世界を変えるアプリ",
    "sealed_at": "2026-02-16T12:00:00.000Z",
    "created_at": "2026-02-16T10:00:00.000Z",
    "updated_at": "2026-02-16T12:00:00.000Z",
    "creator_user_hash": "abc12345..."
  }
]
```

---

### `GET /api/wakuwaku/product/:id`

プロダクトの詳細を取得します。認証不要。

**パスパラメータ:**

| パラメータ | 説明 |
|------------|------|
| `id` | プロダクトID |

**レスポンス:** products 一覧の1件と同じ構造

**エラー:**

| ステータス | 条件 |
|------------|------|
| `404` | プロダクトが見つかりません |

---

### `POST /api/wakuwaku/delete-product`

プロダクトを削除します。**投稿者本人のみ操作可能**です。

**リクエスト:**
```json
{
  "id": "number（プロダクトID）",
  "user_hash": "string（操作者のユーザー識別子）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "プロダクトを削除しました"
}
```

**エラー:**

| ステータス | 条件 |
|------------|------|
| `403` | 自分の投稿のみ削除できます |
| `404` | プロダクトが見つかりません |

---

### `POST /api/wakuwaku/unseal`

封印を解除してドラフトに戻します。**🔒 管理者のみ操作可能**です。

**リクエスト:**
```json
{
  "id": "number（プロダクトID）",
  "user_hash": "string（管理者のユーザー識別子）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "下書きに戻しました"
}
```

**エラー:**

| ステータス | 条件 |
|------------|------|
| `403` | 権限がありません(Admin Only) |

---

## 管理者 API (`/api/admin`)

> すべてのエンドポイントでサーバーサイドの管理者権限チェック（`verifyAdmin`）が行われます。

### `POST /api/admin/check`

現在のユーザーが管理者かどうかを確認します。

**リクエスト:**
```json
{
  "user_hash": "string"
}
```

**レスポンス:**
```json
{
  "is_admin": true
}
```

---

### `POST /api/admin/stats`

サイト統計情報を取得します。🔒 管理者のみ。

**リクエスト:**
```json
{
  "user_hash": "string（管理者）"
}
```

**レスポンス:**
```json
{
  "users": 15,
  "issues": 42,
  "products": 8,
  "comments": 120
}
```

---

### `POST /api/admin/users`

ユーザー一覧を取得します。🔒 管理者のみ。

**リクエスト:**
```json
{
  "user_hash": "string（管理者）"
}
```

**レスポンス:**
```json
{
  "users": [
    {
      "user_hash": "abc12345...",
      "created_at": "2026-02-10T08:00:00.000Z",
      "is_admin": 0
    }
  ]
}
```

---

### `POST /api/admin/recent-activity`

最近のアクティビティ（課題＋プロダクト）を最大10件取得します。🔒 管理者のみ。

**リクエスト:**
```json
{
  "user_hash": "string（管理者）"
}
```

**レスポンス:**
```json
{
  "activities": [
    {
      "title": "ボタンが効かない",
      "created_at": "2026-02-16T12:00:00.000Z",
      "user_hash": "abc12345...",
      "type": "コマラボ"
    },
    {
      "title": "天気予報アプリ",
      "created_at": "2026-02-16T11:00:00.000Z",
      "user_hash": "def67890...",
      "type": "ワクワク"
    }
  ]
}
```

---

### `POST /api/admin/update-base-prompt`

ワクワク試作室のベースプロンプトを更新します。🔒 管理者のみ。

**リクエスト:**
```json
{
  "user_hash": "string（管理者）",
  "prompt": "string（新しいプロンプト内容）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "ベースプロンプトを更新しました"
}
```

---

### `POST /api/admin/constraints/list`

制約スロット一覧を取得します。🔒 管理者のみ。

**リクエスト:**
```json
{
  "user_hash": "string（管理者）"
}
```

**レスポンス:**
```json
[
  {
    "id": 1,
    "category": "技術制約",
    "content": "CSSアニメーションだけで実装する"
  }
]
```

---

### `POST /api/admin/constraints`

制約スロットを追加します。🔒 管理者のみ。

**リクエスト:**
```json
{
  "user_hash": "string（管理者）",
  "category": "string（カテゴリ名）",
  "content": "string（制約内容）"
}
```

**レスポンス:**
```json
{
  "success": true
}
```

---

### `POST /api/admin/constraints/delete`

制約スロットを削除します。🔒 管理者のみ。

**リクエスト:**
```json
{
  "user_hash": "string（管理者）",
  "id": "number（制約ID）"
}
```

**レスポンス:**
```json
{
  "success": true
}
```

---

## エラーハンドリング

### サーバーサイドのログ規約

すべてのcatchブロックで以下の形式でログ出力されます：

```
[モジュール名/エンドポイント名] エラー種別: エラーオブジェクト
```

**例:**
```
[wakuwaku/drafts/save] 保存エラー: Error: SQLITE_CONSTRAINT: ...
[issues/comment] コメント投稿エラー: Error: ...
[admin/stats] 統計取得エラー: Error: D1_ERROR: ...
```

### クライアントへのエラーレスポンス

内部エラーの詳細はクライアントに返されません。すべて汎用メッセージで返します。

```json
// ❌ 以前の方式（内部情報が漏洩）
{ "message": "保存失敗: SQLITE_CONSTRAINT: UNIQUE constraint failed: users.user_hash" }

// ✅ 現在の方式（汎用メッセージのみ）
{ "message": "保存に失敗しました" }
```

---

## データモデル

### `users` テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| `id` | INTEGER (PK) | 自動採番 |
| `user_hash` | TEXT (UNIQUE) | ユーザー識別子 |
| `password_hash` | TEXT | SHA-256 ハッシュ化パスワード |
| `is_admin` | INTEGER | 管理者フラグ（0: 一般, 1: 管理者） |
| `created_at` | DATETIME | 登録日時 |

### `issues` テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| `id` | INTEGER (PK) | 自動採番 |
| `requester_id` | INTEGER (FK → users.id) | 投稿者 |
| `title` | TEXT | 課題タイトル |
| `description` | TEXT | 課題の説明 |
| `status` | TEXT | `open` / `progress` / `closed` |
| `developer_id` | INTEGER (FK → users.id, NULL) | 着手者 |
| `created_at` | DATETIME | 投稿日時 |

### `comments` テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| `id` | INTEGER (PK) | 自動採番 |
| `issue_id` | INTEGER (FK → issues.id) | 対象課題 |
| `user_id` | INTEGER (FK → users.id) | 投稿者 |
| `content` | TEXT | コメント内容 |
| `created_at` | DATETIME | 投稿日時 |

### `products` テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| `id` | INTEGER (PK) | 自動採番 |
| `creator_id` | INTEGER (FK → users.id) | 作成者 |
| `title` | TEXT | プロダクト名 |
| `status` | TEXT | `draft` / `published` |
| `url` | TEXT (NULL) | プロダクトURL |
| `dev_obsession` | TEXT (NULL) | こだわりポイント |
| `protocol_log` | TEXT (NULL) | 仕様書・プロトコルログ |
| `dialogue_log` | TEXT (NULL) | AI対話ログ |
| `catch_copy` | TEXT (NULL) | キャッチコピー |
| `sealed_at` | DATETIME (NULL) | 封印日時 |
| `created_at` | DATETIME | 作成日時 |
| `updated_at` | DATETIME | 最終更新日時 |

### `slot_constraints` テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| `id` | INTEGER (PK) | 自動採番 |
| `category` | TEXT | カテゴリ名 |
| `content` | TEXT | 制約内容 |

### `site_configs` テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| `key` | TEXT (PK) | 設定キー（例: `wakuwaku_base_prompt`） |
| `value` | TEXT | 設定値 |
| `updated_at` | DATETIME | 最終更新日時 |

---

## 認可マトリクス

| エンドポイント | 認証 | 所有者チェック | 管理者チェック |
|---|---|---|---|
| `POST /api/auth/login` | — | — | — |
| `GET /api/issues/list` | — | — | — |
| `POST /api/issues/post` | user_hash | — | — |
| `POST /api/issues/update-status` | user_hash（progress時） | — | — |
| `POST /api/issues/unassign` | user_hash | ✅ 担当者本人 | — |
| `GET /api/issues/detail` | — | — | — |
| `POST /api/issues/comment` | user_hash | — | — |
| `POST /api/issues/delete` | user_hash | ✅ 投稿者本人 | — |
| `GET /api/wakuwaku/base-prompt` | — | — | — |
| `GET /api/wakuwaku/constraints/random` | — | — | — |
| `POST /api/wakuwaku/drafts` | user_hash | — | — |
| `GET /api/wakuwaku/drafts` | user_hash | — | — |
| `POST /api/wakuwaku/drafts/save` | user_hash | ✅ 投稿者本人 | — |
| `POST /api/wakuwaku/seal` | user_hash | ✅ 投稿者本人 | — |
| `GET /api/wakuwaku/products` | — | — | — |
| `GET /api/wakuwaku/product/:id` | — | — | — |
| `POST /api/wakuwaku/delete-product` | user_hash | ✅ 投稿者本人 | — |
| `POST /api/wakuwaku/unseal` | user_hash | — | ✅ verifyAdmin |
| `POST /api/admin/*` | user_hash | — | ✅ verifyAdmin |
