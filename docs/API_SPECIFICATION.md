# API 仕様書

**プロジェクト:** m-komarabo-v2 (Matsutani Prototyping Studio)  
**ベースURL:** `/api`  
**フレームワーク:** Hono (Cloudflare Pages Functions)  
**データベース:** Cloudflare D1  
**最終更新日:** 2026-03-05

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

**Google OAuth 2.0** と **JWT (JSON Web Token)** を用いたセキュアなCookie認証を採用しています。

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
Google OAuthのログイン画面へリダイレクトするためのエンドポイント。CSRF対策として nonce を Cookie に保存し、`state` パラメータへも埋め込む。

**クエリパラメータ:**
- `redirect_to`: ログイン後のリダイレクト先（省略時は `/komarabo/index.html`）

### `GET /api/auth/callback`
Googleからのコールバックを受け取り、nonce の照合（CSRF検証）後、内部の `users` テーブルと照合（初回はUpsert）し、ブラウザへ `auth_token` の発行（CookieのSet）を行ったのち、元の画面へリダイレクトします。

### `GET /api/auth/me`
現在のログインユーザーの情報をCookieから検証して返却します。DBから最新情報を取得。

**レスポンス:**
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid-1234",
    "display_name": "Matsutani",
    "email": "example@gmail.com",
    "role": "admin",
    "avatar_url": "https://...",
    "is_profile_completed": true,
    "created_at": "2026-02-16T10:00:00.000Z"
  }
}
```

### `POST /api/auth/profile`
表示名を変更し、`is_profile_completed` を true にしてJWTを再発行します。（認証必須）

**リクエスト:**
```json
{ "display_name": "新しい表示名" }
```

### `POST /api/auth/logout`
JWTのCookieを削除し、ログアウト処理を行います。

---

## コマラボ API

### `GET /api/issues/list`
課題（悩み事）の一覧を取得します。(パブリック)

**クエリパラメータ:**
- `filter`: `all`（デフォルト）または `mine`（自分の投稿のみ）

**レスポンス:**
```json
[
  {
    "id": 1,
    "requester_id": "uuid-123",
    "title": "ログインできない",
    "subtitle": "iOSのSafariで再現する問題",
    "description": "スマホブラウザでエラーが出る",
    "status": "open",
    "developer_id": null,
    "requirement_log": null,
    "created_at": "2026-02-16T10:00:00.000Z",
    "updated_at": "2026-02-16T10:00:00.000Z",
    "requester_name": "Taro",
    "developer_name": null
  }
]
```

### `GET /api/issues/detail`
課題の詳細情報と紐づくコメント一覧を取得します。（パブリック）

**クエリパラメータ:**
- `id`: 課題ID（必須）

### `GET /api/issues/requirement-prompt`
コマラボ用の要件定義プロンプト（`is_active=1` の1件）を取得します。（パブリック）

### `POST /api/issues/post`
新しい課題を投稿します。（認証必須）

**リクエスト:**
```json
{
  "title": "string（200文字以内）",
  "description": "string（10000文字以内）"
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
担当した課題をキャンセルし、`open` へ戻します。（認証必須・担当者本人または相談者本人のみ）自動コメントが挿入されます。

**リクエスト:**
```json
{ "id": 1 }
```

### `POST /api/issues/comment`
課題にコメントを投稿します。（認証必須）コメント投稿時に課題の `updated_at` も更新されます。

**リクエスト:**
```json
{
  "issue_id": 1,
  "content": "こちらを試してみてください。（2000文字以内）"
}
```

### `POST /api/issues/delete`
課題を削除します。（認証必須・投稿者本人かつ未着手の課題のみ）関連コメントも一括削除されます。

**リクエスト:**
```json
{ "id": 1 }
```

### `POST /api/issues/update-requirement`
Gemini等が生成・または人間が編集した「要件定義ログ」を更新・保存します。（認証必須・依頼者または担当開発者のみ）

**リクエスト:**
```json
{
  "id": 1,
  "requirement_log": "string（50000文字以内）"
}
```

### `POST /api/issues/update-subtitle`
課題のサブタイトルを更新します。（認証必須・依頼者または担当開発者のみ）

**リクエスト:**
```json
{
  "id": 1,
  "subtitle": "string（200文字以内）"
}
```

---

## ワクワク試作室 API

### `GET /api/wakuwaku/version`
バージョン情報を返します。（パブリック）

### `GET /api/wakuwaku/base-prompts`
管理画面で設定されたAI用「ベースプロンプト」の一覧を取得します（`feature='wakuwaku'` かつ `is_active=1`）。（パブリック）

### `GET /api/wakuwaku/constraints/random`
ガチャ用のランダムな制約スロットを1件取得します。（パブリック）

### `GET /api/wakuwaku/products`
公開済み（封印済み）のプロダクト一覧（ギャラリー）を取得します。封印日の降順。（パブリック）

### `GET /api/wakuwaku/product/:id`
公開プロダクトの詳細を取得します。（パブリック）

### `GET /api/wakuwaku/drafts`
自分が作成進行中のドラフト一覧を取得します。（認証必須）

### `POST /api/wakuwaku/drafts`
新しい試作品ドラフト（下書き）を作成します。（認証必須）

**リクエスト:**
```json
{ "title": "アプリ名（200文字以内）" }
```
**レスポンス:**
```json
{ "success": true, "id": 123 }
```

### `POST /api/wakuwaku/drafts/save`
ドラフトデータを上書き保存します。（認証必須・作成者本人のみ）

**リクエスト:**
```json
{
  "id": 123,
  "url": "https://...",
  "dev_obsession": "こだわり（5000文字以内）",
  "protocol_log": "仕様書（100000文字以内）",
  "dialogue_log": "対話ログ（100000文字以内）",
  "catch_copy": "キャッチコピー（200文字以内）"
}
```

### `POST /api/wakuwaku/seal`
ドラフトを封印（公開）します。`protocol_log` と `dialogue_log` は必須。`status` が `published` に切り替わります。（認証必須・作成者本人のみ）

### `POST /api/wakuwaku/delete-product`
プロダクトを削除します。（認証必須・作成者本人のみ）

**リクエスト:**
```json
{ "id": 123 }
```

### `POST /api/wakuwaku/unseal`
封印を解除し、`draft` 状態へと巻き戻します。**（管理者のみ実行可能）**

**リクエスト:**
```json
{ "id": 123 }
```

---

## 管理者 API

これらのAPIはすべて `authMiddleware` および `adminGuard` により、管理者のみにアクセスが制限されています。

### `GET /api/admin/check`
現在のユーザーが管理者かどうかをチェックします（ダッシュボード表示用）。アクセスできた時点で管理者です。

### `GET /api/admin/stats`
D1データベースからの全体統計（総ユーザー数、課題数、作品数、コメント数）を取得します。

### `GET /api/admin/users`
ユーザー一覧を取得します（作成日降順）。

### `GET /api/admin/recent-activity`
直近の投稿アクティビティ（コマラボ・ワクワク合算、最大10件）を取得します。

### `POST /api/admin/users/toggle-role`
指定ユーザーの権限（`admin` / `user`）をトグル（切り替え）します。自分自身は変更不可。

```json
{ "target_user_id": "uuid-xxx" }
```

### `POST /api/admin/users/toggle-active`
指定ユーザーのアカウント有効状態（ログイン可否）を切り替えます。自分自身は変更不可。

```json
{ "target_user_id": "uuid-xxx" }
```

### `GET /api/admin/base-prompts/list`
ベースプロンプトの一覧を取得します。`feature` クエリで絞り込み可能。

**クエリパラメータ:**
- `feature`: `wakuwaku` | `komarabo`（省略時は全件）

### `POST /api/admin/base-prompts/save`
ベースプロンプトを新規作成または更新します。`id` がある場合は更新、ない場合は新規作成。

```json
{
  "id": 1,
  "label": "ラベル名（100文字以内）",
  "prompt": "プロンプト内容（10000文字以内）",
  "feature": "wakuwaku",
  "is_active": 1
}
```

### `POST /api/admin/base-prompts/delete`
指定IDのベースプロンプトを削除します。

```json
{ "id": 1 }
```

### `POST /api/admin/base-prompts/activate-komarabo`
コマラボ用プロンプトの「アクティブ」を切り替えます。指定した ID のみ `is_active=1` となり、他の `feature='komarabo'` のプロンプトはすべて `is_active=0` になります（アトミック処理）。

```json
{ "id": 1 }
```

### `POST /api/admin/base-prompts/import`
指定 `feature` のプロンプトを一括置き換えインポートします（既存データは全削除）。

**クエリパラメータ:** `feature=wakuwaku` or `komarabo`

```json
[
  { "label": "ラベル", "prompt": "内容", "is_active": 1 }
]
```

### `GET /api/admin/constraints/list`
制約スロットの一覧を取得します（ID降順）。

### `POST /api/admin/constraints`
制約スロットを新規追加します。

```json
{ "category": "カテゴリ", "content": "制約内容" }
```

### `POST /api/admin/constraints/delete`
指定IDの制約スロットを削除します。

```json
{ "id": 1 }
```

### `POST /api/admin/constraints/import`
制約スロットを一括置き換えインポートします（既存データは全削除）。

```json
[
  { "category": "カテゴリ", "content": "制約内容" }
]
```
