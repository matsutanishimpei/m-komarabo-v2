# API 仕様書

**プロジェクト:** m-komarabo-v2 (Matsutani Prototyping Studio)  
**ベースURL:** `/api`  
**フレームワーク:** Hono (Cloudflare Pages Functions)  
**データベース:** Cloudflare D1  
**最終更新日:** 2026-02-23

---

## 目次

1. [共通仕様](#共通仕様)
2. [認証 API (`/api/auth`)](#認証-api)
3. [コマラボ API (`/api/issues`)](#コマラボ-api)
4. [ワクワク試作室 API (`/api/wakuwaku`)](#ワクワク試作室-api)
5. [管理者 API (`/api/admin`)](#管理者-api)

---

## 共通仕様

### 認証方式 (Google OAuth + JWT Cookie)

以前の `user_hash` による独自認証から、**Google OAuth 2.0** と **JWT (JSON Web Token)** を用いたセキュアなCookie認証へ移行しました。

- クライアント側で明示的にトークンを送信する必要はありません。フロントエンドの `fetch` や `apiRequest` において `credentials: 'same-origin'` を指定することで、ブラウザが自動的に `auth_token` Cookie（HttpOnly, Secure, SameSite=Lax）を付与し、サーバーサイドで検証されます。

### アクセス制御
- **パブリック API**: ログイン状態を問わず閲覧可能（`GET /api/issues/list`、`GET /api/wakuwaku/products` などの一覧・詳細取得系API）。
- **認証必須 API**: `authMiddleware` によって保護。投稿や更新、マイページの取得など。
- **管理者 API**: `adminGuard` によって保護。自身の `users.role` が `admin` でない限り 403 エラーとなります。

### レスポンス形式

すべてのレスポンスはJSON形式です。

**成功時:**
```json
{
  "success": true,
  "message": "ステータスを更新しました"
}
```

**エラー時:**
```json
{
  "success": false,
  "message": "ログインが必要です"
}
```

---

## 認証 API

### `GET /api/auth/google`
Google OAuthのログイン画面へリダイレクトするためのエンドポイント。

### `GET /api/auth/callback`
Googleからのコールバックを受け取り、内部の `users` テーブルと照合（初回はUpsert）し、ブラウザへ `auth_token` の発行（CookieのSet）を行ったのち、元の画面へリダイレクトします。

### `GET /api/auth/me`
現在のログインユーザーの情報をCookieから検証して返却します。

**レスポンス:**
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid-1234",
    "display_name": "Matsutani",
    "role": "admin"
  }
}
```

### `POST /api/auth/logout`
JWTのCookieを破棄（Max-Age=0）し、ログアウト処理を行います。

---

## コマラボ API

### `GET /api/issues/list`
課題（悩み事）の一覧を取得します。(パブリック)

**クエリパラメータ:**
- `filter`: `all`（デフォルト）または `mine`（自分が関連する投稿のみ。ログイン必須）

**レスポンス:**
```json
[
  {
    "id": 1,
    "requester_id": "uuid-123",
    "title": "ログインできない",
    "description": "スマホブラウザでエラーが出る",
    "status": "open",
    "developer_id": null,
    "created_at": "2026-02-16T10:00:00.000Z",
    "requester_name": "Taro"
  }
]
```

### `POST /api/issues/post`
新しい課題を投稿します。（認証必須）

**リクエスト:**
```json
{
  "title": "string",
  "description": "string"
}
```

### `POST /api/issues/update-status`
ステータスを更新します。(`open`, `progress`, `closed`)。（認証必須）
- `progress` への変更時：リクエスト者が担当者(`developer_id`)として割り当てられます。すでに着手済みの場合はエラー。
- `closed` への変更時：リクエスト者が依頼者(`requester_id`)本人であるか照合され、本人以外はエラー。

**リクエスト:**
```json
{
  "id": 1,
  "status": "progress"
}
```

### `POST /api/issues/unassign`
担当した課題をキャンセル（未着手へ戻す）します。（認証必須・担当者本人のみ）

### `GET /api/issues/detail`
課題の詳細情報と紐づくコメント一覧を取得します。（パブリック）

### `POST /api/issues/comment`
課題にコメントを投稿します。（認証必須）
```json
{
  "issue_id": 1,
  "content": "こちらを試してみてください。"
}
```

### `POST /api/issues/delete`
課題を削除します。（認証必須・投稿者本人かつ未着手の課題のみ）

### `POST /api/issues/update-requirement`
Gemini等が生成・または人間が編集した「要件定義ログ」を更新・保存します。（認証必須・依頼者または開発担当者のみ）

---

## ワクワク試作室 API

### `GET /api/wakuwaku/base-prompts`
管理画面で設定されたAI用「ベースプロンプト」の一覧を取得します。（パブリック）

### `GET /api/wakuwaku/constraints/random`
ガチャ用のランダムな制約スロットを1件取得します。（パブリック）

### `POST /api/wakuwaku/drafts`
新しい試作品ドラフト（下書き）を作成します。（認証必須）
- リクエスト: `{"title": "アプリ명"}`
- レスポンス: 新規の `id` を返却

### `GET /api/wakuwaku/drafts`
自分が作成進行中のドラフト一覧を取得します。（認証必須）

### `POST /api/wakuwaku/drafts/save`
ドラフトデータを上書き保存します。（認証必須・投稿者本人のみ）
`url`, `dev_obsession`, `protocol_log`, `dialogue_log`, `catch_copy` の更新。

### `POST /api/wakuwaku/seal`
ドラフトを封印（公開）します。必須項目（仕様書と対話ログ）のチェック後、`status` が `published` に切り替わります。（認証必須・本人のみ）

### `GET /api/wakuwaku/products` 
公開済み（封印済み）のプロダクト一覧（ギャラリー）を取得します。封印日の降順。（パブリック）

### `GET /api/wakuwaku/product/:id`
公開プロダクトの詳細を取得します。（パブリック）

### `POST /api/wakuwaku/unseal`
封印を解除し、`draft` 状態へと巻き戻します。**（管理者のみ実行可能）**

---

## 管理者 API

これらのAPIはすべて `authMiddleware` および `adminGuard` により、管理者のみにアクセスが制限されています。

### `POST /api/admin/check`
現在のユーザーが管理者かどうかをチェックします（ダッシュボード表示用）。アクセスできた時点で管理者です。

### `POST /api/admin/stats`
D1データベースからの全体統計（総ユーザー数、課題数、作品数、コメント数）を取得します。

### `POST /api/admin/users`
ユーザー一覧を取得。

### `POST /api/admin/users/toggle-role`
指定ユーザーの権限（`admin` / `user`）をトグル（切り替え）します。
```json
{ "target_user_id": "uuid-xxx" }
```

### `POST /api/admin/users/toggle-active`
指定ユーザーのアカウント有効状態（ログイン可否）を切り替えます。

### `POST /api/admin/base-prompts/save` / `delete`
ワクワク試作室のベースプロンプト、Ideationテーマ内容を作成・更新・削除します。

### `POST /api/admin/constraints` / `delete`
ワクワク試作室のIdeationガチャで出てくる「制約スロット」管理。

### `POST /api/admin/update-requirement-prompt`
コマラボ側の自動要件定義プロンプトの中身を設定します（`site_configs` へ保存）。
