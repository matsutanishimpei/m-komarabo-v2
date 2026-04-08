# セキュリティ診断レポート

**プロジェクト:** m-komarabo-v2 (Matsutani Prototyping Studio)  
**診断日:** 2026-02-16  
**診断対象:** フロントエンド (HTML/JS) + バックエンド (Hono/Cloudflare Workers)  
**診断者:** Antigravity Security Audit

---

## サマリー

| 深刻度 | 件数 | 説明 | 対応状況 |
|--------|------|------|----------|
| 🔴 Critical | 3 | 即座に対応が必要。悪用されると致命的な被害が生じる | 1件修正済 |
| 🟠 High | 5 | 早期対応推奨。攻撃者に悪用される可能性が高い | 4件修正済 |
| 🟡 Medium | 4 | 計画的に対応。リスクは限定的だが改善すべき | 1件修正済 |
| 🔵 Low | 3 | 改善推奨。セキュリティのベストプラクティスに準拠するため | 未対応 |

**総合リスク評価: 🟠 High（認証・認可の根本的な問題あり）**

---

## 🔴 Critical（即時対応必須）

### CRIT-01: 認証トークンが機能していない（認証バイパス）

**深刻度:** 🔴 Critical  
**カテゴリ:** 認証 (Authentication)  
**影響範囲:** 全APIエンドポイント

**現状:**
`auth.ts` のログインAPIが返す `auth_token` はダミー値（`'dummy_token_' + Date.now()`）であり、**どのAPIエンドポイントもこのトークンを検証していません**。

```typescript
// auth.ts:39 — ダミートークン生成
auth_token: 'dummy_token_' + Date.now()
```

すべてのAPI呼び出しは `user_hash` をリクエストボディに含めるだけで認証を通過します。これは「知識ベース認証」に該当しますが、`user_hash` はニックネームとして公開されているため、**誰でも他人の `user_hash` を使ってAPIを呼び出せます**。

**攻撃シナリオ:**
1. Gallery画面で他人の `user_hash`（先頭8文字が表示される）を推測
2. その `user_hash` を使って `/api/wakuwaku/drafts/save`、`/api/wakuwaku/delete-product` 等を呼び出し
3. 他人のドラフトの改ざん・削除が可能

**対象ファイル:**
- `functions/api/auth.ts` (トークン生成)
- `functions/api/wakuwaku.ts` (全エンドポイント)
- `functions/api/issues.ts` (全エンドポイント)
- `functions/api/admin.ts` (全管理エンドポイント)

**推奨対応:**
```
1. JWT (JSON Web Token) またはセッションベースの認証を実装
2. Hono のミドルウェアとして認証チェックを一元化
3. 全APIリクエストでトークンの検証を必須化
4. user_hash をリクエストボディではなくトークンから取得するように変更
```

---

### CRIT-02: 管理者権限の昇格が可能（Privilege Escalation）

**深刻度:** 🔴 Critical  
**カテゴリ:** 認可 (Authorization)  
**影響範囲:** 管理画面、管理API全般

**現状:**
管理者権限は `localStorage.getItem('is_admin')` で判断されており、**ブラウザのDevToolsから `localStorage.setItem('is_admin', '1')` を実行するだけで管理者UIが表示されます**。

バックエンドの `verifyAdmin` はDBを参照するため管理APIは保護されていますが、フロントエンドのUnlockボタン等はクライアント側の `is_admin` フラグのみで表示制御されています。

```javascript
// wakuwaku.js:374
const adminFlag = isAdmin(); // localStorage ベース
```

**攻撃シナリオ:**
1. DevToolsで `localStorage.setItem('is_admin', '1')` を実行
2. Gallery画面にUnlockボタンが表示される
3. Unlockボタンを押すと `/api/wakuwaku/unseal` が呼ばれるが、バックエンドで拒否される（実害は限定的）
4. ただし、管理画面 `/admin/index.html` へのアクセスは可能になり、UI上で管理情報が見えてしまう可能性がある（`checkAdminAccess()` がサーバー検証を行うため、最終的にはリダイレクトされる）

**対象ファイル:**
- `public/js/wakuwaku.js` (L374)
- `public/js/common.js` (`isAdmin()` 関数)
- `public/login.html` (L220: `is_admin` のlocalStorage保存)

**推奨対応:**
```
1. 管理者限定UIの表示判断はサーバーから取得した情報に基づくべき
2. フロントのis_adminはあくまでUI最適化用のヒントとし、
   セキュリティ判断には使用しない（現状バックエンドは正しく保護されている）
3. 管理画面のページ自体へのアクセス制御を強化
```

---

### CRIT-03: パスワードの平文比較フォールバック ✅ 修正済み

**深刻度:** 🔴 Critical  
**カテゴリ:** 認証 (Authentication)  
**影響範囲:** ログインAPI

**現状:**
`auth.ts` のログイン処理で、ハッシュ化パスワードの比較に加えて**平文パスワードとの比較も許可**されています。

```typescript
// auth.ts:49
if (existingUser.password_hash === password_hash || existingUser.password_hash === password) {
```

この `existingUser.password_hash === password` の部分は、DBに平文パスワードが保存されていた場合のフォールバックですが、以下のリスクがあります：

1. DBが漏洩した場合、パスワードが平文で保存されているレコードが即座に悪用される
2. この分岐が意図的に利用可能であること自体がセキュリティポリシー違反

**対象ファイル:** `functions/api/auth.ts` (L49)

**推奨対応:**
```typescript
// 平文比較を完全に削除
if (existingUser.password_hash === password_hash) {
    // ログイン成功
}
// 既存の平文パスワードユーザーには、パスワードリセットを案内
```

---

## 🟠 High（早期対応推奨）

### HIGH-01: XSS脆弱性 — `komarabo/detail.html` のコメント表示 ✅ 修正済み

**深刻度:** 🟠 High  
**カテゴリ:** XSS (Cross-Site Scripting)  
**影響範囲:** コマラボ詳細画面のコメントタイムライン

**現状:**
`komarabo/detail.html` のコメント表示では `escapeHtml` が使用されず、`c.content` がHTMLとして直接挿入されています。

```javascript
// komarabo/detail.html:209
${c.content.replace(/\\n/g, '<br>')}
```

攻撃者がコメントに `<script>alert('XSS')</script>` や `<img onerror="..." src="x">` を投稿すると、他のユーザーのブラウザで任意のJavaScriptが実行されます。

**対象ファイル:** `public/komarabo/detail.html` (L209)

**推奨対応:**
```javascript
// escapeHtml を import して使用
${escapeHtml(c.content).replace(/\n/g, '<br>')}
```

---

### HIGH-02: XSS脆弱性 — `komarabo/index.html` のIssue一覧 ✅ 修正済み

**深刻度:** 🟠 High  
**カテゴリ:** XSS (Cross-Site Scripting)  
**影響範囲:** コマラボのメイン画面

**現状:**
```javascript
// komarabo/index.html:253
<h5 class="font-bold ...">${i.title}</h5>
// komarabo/index.html:295-296
<h5 class="text-lg font-bold ...">${i.title}</h5>
<p class="text-sm ...">${i.description}</p>
```

Issue の `title` と `description` が `escapeHtml` を通さずにHTMLへ挿入されています。

**対象ファイル:** `public/komarabo/index.html` (L253, L295-296)

**推奨対応:**
```javascript
// common.js から escapeHtml を import して全出力をエスケープ
${escapeHtml(i.title)}
${escapeHtml(i.description)}
```

---

### HIGH-03: XSS脆弱性 — `admin/index.html` の管理画面 ✅ 修正済み

**深刻度:** 🟠 High  
**カテゴリ:** XSS (Cross-Site Scripting)  
**影響範囲:** 管理画面

**現状:**
管理画面で表示されるユーザー名、アクティビティ、制約スロットが `escapeHtml` なしで描画されています。

```javascript
// admin/index.html:256
${user.user_hash.substring(0, 2).toUpperCase()}
// admin/index.html:259
<p class="font-medium ...">${user.user_hash}</p>
// admin/index.html:283
<p class="text-sm ...">${activity.title}</p>
// admin/index.html:284
... by ${activity.user_hash}
// admin/index.html:303
<span class="text-sm ...">${c.content}</span>
```

管理画面は高権限ユーザーがアクセスするため、XSSによるセッションハイジャックは特に危険です。

**対象ファイル:** `public/admin/index.html` (L256, L259, L283, L284, L303)

**推奨対応:**
```javascript
// escapeHtml を import して全ユーザー入力をエスケープ
import { escapeHtml } from '../js/common.js';
${escapeHtml(user.user_hash)}
${escapeHtml(activity.title)}
${escapeHtml(c.content)}
```

---

### HIGH-04: 認可不備 — Issues の `unassign` / `update-status` に所有者チェックなし

**深刻度:** 🟠 High  
**カテゴリ:** 認可 (Authorization)  
**影響範囲:** Issues API

**現状:**
`/api/issues/unassign` は `id` のみで操作可能で、**誰がリクエストしたかのチェックがありません**。任意のユーザーが任意のIssueの着手をキャンセルできます。

```typescript
// issues.ts:64
const { id } = await c.req.json();
await c.env.DB.prepare(
    'UPDATE issues SET status = "open", developer_id = NULL WHERE id = ?'
).bind(id).run();
```

同様に `/api/issues/update-status` も、`user_hash` を受け取るが適切な権限チェックが不十分です。

**対象ファイル:** `functions/api/issues.ts` (L63-71, L41-56)

**推奨対応:**
```typescript
// unassign: 現在の developer が自分自身であるかを検証
const issue = await c.env.DB.prepare(
    'SELECT developer_id FROM issues WHERE id = ?'
).bind(id).first();
const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE user_hash = ?'
).bind(user_hash).first();
if (!issue || issue.developer_id !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
}
```

---

### HIGH-05: オープンリダイレクト脆弱性 ✅ 修正済み

**深刻度:** 🟠 High  
**カテゴリ:** リダイレクト (Open Redirect)  
**影響範囲:** ログインページ

**現状:**
`login.html` でクエリパラメータ `redirect_to` の値をそのまま `location.href` に設定しています。

```javascript
// login.html:149-151
const redirectParam = urlParams.get('redirect_to');
if (redirectParam) {
    redirectTo = decodeURIComponent(redirectParam);
}
// login.html:226
location.href = redirectTo;
```

攻撃者が `login.html?redirect_to=https://evil.com` のようなURLを作成すると、ユーザーがログイン後に悪意のあるサイトへリダイレクトされます（フィッシング攻撃）。

**対象ファイル:** `public/login.html` (L149-151, L226)

**推奨対応:**
```javascript
// リダイレクト先を同一オリジンに限定
if (redirectParam) {
    const decoded = decodeURIComponent(redirectParam);
    // 同一オリジンのパスのみ許可（http/https で始まるものは拒否）
    if (decoded.startsWith('/') && !decoded.startsWith('//')) {
        redirectTo = decoded;
    }
}
```

---

## 🟡 Medium（計画的対応）

### MED-01: パスワードハッシュにソルト(Salt)未使用

**深刻度:** 🟡 Medium  
**カテゴリ:** 暗号 (Cryptography)  
**影響範囲:** ユーザー認証

**現状:**
SHA-256によるハッシュ化にソルトが使用されていません。同じパスワードを持つユーザーは同一のハッシュ値を持ちます。

```typescript
// auth.ts:7-12
async function hashPassword(password: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    ...
}
```

レインボーテーブル攻撃に対して脆弱です。

**対象ファイル:** `functions/api/auth.ts` (L7-12)

**推奨対応:**
```
1. ユーザーごとにランダムなソルトを生成し、DBに保存
2. 可能であれば bcrypt/scrypt/argon2 を使用（Cloudflare Workers では
   Web Crypto API の PBKDF2 が代替として利用可能）
```

---

### MED-02: CSRF対策の欠如

**深刻度:** 🟡 Medium  
**カテゴリ:** CSRF (Cross-Site Request Forgery)  
**影響範囲:** 全POST APIエンドポイント

**現状:**
CSRFトークンが実装されていません。攻撃者が悪意のあるページにユーザーを誘導し、自動的にPOSTリクエストを送信させることが可能です。

ただし、現在の認証方式は `user_hash` をリクエストボディに含める方式のため、Cookie認証と比べてCSRFリスクは軽減されています。

**推奨対応:**
```
1. SameSite Cookie属性の適用（Cookie認証に移行する場合）
2. Originヘッダーの検証
3. CSRFトークンの実装
```

---

### MED-03: エラーメッセージによる情報漏洩

**深刻度:** 🟡 Medium  
**カテゴリ:** 情報漏洩 (Information Leakage)  
**影響範囲:** 各APIエンドポイント

**現状:**
エラーレスポンスに内部エラーメッセージがそのまま含まれています。

```typescript
// wakuwaku.ts:116-117
const msg = err.message || JSON.stringify(err);
return c.json({ success: false, message: '保存失敗: ' + msg }, 500);

// auth.ts:42
return c.json({ success: false, message: '登録に失敗しました: ' + (e instanceof Error ? e.message : String(e)) }, 500);
```

DB構造やクエリエラーの詳細が攻撃者に漏洩する可能性があります。

**推奨対応:**
```typescript
// 本番環境ではユーザーに汎用メッセージを返す
console.error('Detailed error:', err); // ログにのみ詳細を記録
return c.json({ success: false, message: 'サーバーエラーが発生しました' }, 500);
```

---

### MED-04: `edit.html` のテンプレートインジェクション ✅ 修正済み

**深刻度:** 🟡 Medium  
**カテゴリ:** XSS (Cross-Site Scripting)  
**影響範囲:** ワクワク試作室の編集画面

**現状:**
`edit.html` で `product.title` がテンプレートリテラル内の `value` 属性にエスケープなしで挿入されています。

```javascript
// edit.html:89
<input type="text" id="title" value="${product.title}" ...>
```

タイトルに `" onfocus="alert(1)` のような値が含まれる場合、属性インジェクションが発生します。

**対象ファイル:** `public/wakuwaku/edit.html` (L89, L97, L106)

**推奨対応:**
```javascript
// escapeHtml を import して属性値もエスケープ
value="${escapeHtml(product.title)}"
```

---

## 🔵 Low（改善推奨）

### LOW-01: `showLoading` / `showError` の潜在的XSS

**深刻度:** 🔵 Low  
**カテゴリ:** XSS (Cross-Site Scripting)  
**影響範囲:** 共通ユーティリティ

**現状:**
`common.js` の `showLoading` / `showError` が `innerHTML` でメッセージを設定しています。現在はハードコードされたメッセージのみ使用されていますが、今後ユーザー入力が渡される可能性があります。

```javascript
// common.js:123-128
export function showLoading(elementId, message = '読み込み中...') {
    element.innerHTML = `<div ...><p ...>${message}</p></div>`;
}
```

**推奨対応:** `textContent` を使用するか、メッセージを `escapeHtml` で処理

---

### LOW-02: localStorage に保存された機密情報のクリア漏れ

**深刻度:** 🔵 Low  
**カテゴリ:** データ保持 (Data Retention)  
**影響範囲:** フロントエンド認証

**現状:**
- `common.js` の `logout()` では `user_hash`, `auth_token`, `is_admin` を削除
- `komarabo/detail.html` の `logout()` では `localStorage.clear()` を使用
- `login.html` では `role` を `localStorage` に保存（L219: `localStorage.setItem('role', ...)`）するが、`logout()` で `role` は明示的に削除されていない

**対象ファイル:**
- `public/js/common.js` (L58-64)
- `public/komarabo/detail.html` (L280-283)
- `public/login.html` (L219)

**推奨対応:**
```javascript
// logout を統一し、localStorage.clear() または全キーの明示的削除
export function logout(redirectUrl = '/index.html') {
    localStorage.clear(); // 全データをクリア
    location.href = redirectUrl;
}
```

---

### LOW-03: Rate Limiting / Brute Force 対策の欠如

**深刻度:** 🔵 Low  
**カテゴリ:** DoS / Brute Force
**影響範囲:** ログインAPI

**現状:**
`/api/auth/login` にレート制限がなく、ブルートフォース攻撃（パスワード総当たり）が可能です。自動登録機能もあるため、大量のアカウント作成にも悪用可能です。

**推奨対応:**
```
1. Cloudflare Rate Limiting を設定
2. ログイン失敗回数に応じたアカウントロック
3. CAPTCHA の導入
```

---

## XSS脆弱性マトリクス

以下の表は、各ページでの `escapeHtml` の適用状況をまとめたものです。

| ページ | ユーザー入力のHTML出力 | escapeHtml適用 | 状態 |
|--------|------------------------|----------------|------|
| `wakuwaku/index.html` | — (外部JSに委譲) | — | ✅ N/A |
| `js/wakuwaku.js` | title, creatorDisplay, url | ✅ 適用済み | ✅ Safe |
| `wakuwaku/detail.html` | title, catchCopy, protocol, dialogue, url, dev_obsession | ✅ 適用済み | ✅ Safe |
| `wakuwaku/edit.html` | title, url, dev_obsession | ✅ 適用済み | ✅ Safe (修正済) |
| `wakuwaku/post.html` | — (入力のみ) | — | ✅ N/A |
| `komarabo/index.html` | title, description, user_hash | ✅ 適用済み | ✅ Safe (修正済) |
| `komarabo/detail.html` | コメント content, user_hash | ✅ 適用済み | ✅ Safe (修正済) |
| `admin/index.html` | user_hash, title, content | ✅ 適用済み | ✅ Safe (修正済) |
| `login.html` | — (入力のみ) | — | ✅ N/A |
| `index.html` | — (静的コンテンツ) | — | ✅ N/A |

---

## 認可チェックマトリクス

| API エンドポイント | 認証チェック | 所有者チェック | 管理者チェック | 状態 |
|---|---|---|---|---|
| `POST /api/auth/login` | N/A | N/A | N/A | — |
| `GET /api/wakuwaku/base-prompt` | なし | N/A | N/A | ✅ Public |
| `GET /api/wakuwaku/constraints/random` | なし | N/A | N/A | ✅ Public |
| `POST /api/wakuwaku/drafts` | user_hash存在確認 | N/A | N/A | ⚠️ |
| `GET /api/wakuwaku/drafts` | user_hashクエリ | N/A | N/A | ⚠️ |
| `POST /api/wakuwaku/drafts/save` | user_hash照合 | ✅ 所有者チェック | N/A | ⚠️ CRIT-01 |
| `POST /api/wakuwaku/seal` | user_hash照合 | ✅ 所有者チェック | N/A | ⚠️ CRIT-01 |
| `GET /api/wakuwaku/products` | なし | N/A | N/A | ✅ Public |
| `GET /api/wakuwaku/product/:id` | なし | N/A | N/A | ✅ Public |
| `POST /api/wakuwaku/delete-product` | user_hash照合 | ✅ 所有者チェック | N/A | ⚠️ CRIT-01 |
| `POST /api/wakuwaku/unseal` | user_hash照合 | N/A | ✅ verifyAdmin | ⚠️ CRIT-01 |
| `GET /api/issues/list` | なし | N/A | N/A | ✅ Public |
| `POST /api/issues/update-status` | user_hash(任意) | ❌ 不十分 | N/A | ⚠️ HIGH-04 |
| `POST /api/issues/unassign` | ❌ なし | ❌ なし | N/A | ⚠️ HIGH-04 |
| `POST /api/issues/comment` | user_hash存在確認 | N/A | N/A | ⚠️ CRIT-01 |
| `POST /api/issues/delete` | user_hash照合 | ✅ 所有者チェック | N/A | ⚠️ CRIT-01 |
| `POST /api/issues/post` | user_hash存在確認 | N/A | N/A | ⚠️ CRIT-01 |
| `POST /api/admin/check` | user_hash照合 | N/A | ✅ verifyAdmin | ⚠️ CRIT-01 |
| `POST /api/admin/stats` | user_hash照合 | N/A | ✅ verifyAdmin | ⚠️ CRIT-01 |
| `POST /api/admin/users` | user_hash照合 | N/A | ✅ verifyAdmin | ⚠️ CRIT-01 |
| `POST /api/admin/*` | user_hash照合 | N/A | ✅ verifyAdmin | ⚠️ CRIT-01 |

> ⚠️ **注:** 上記は「所有者チェック」や「管理者チェック」がサーバーサイドで行われているかを示していますが、
> 根本的な問題として **CRIT-01（認証トークンのバイパス）** により、`user_hash` の偽装が可能です。

---

## 対応優先度ロードマップ

### Phase 1: 即時対応（1-2日）
1. **CRIT-03** — 平文パスワード比較の削除（1行の修正）
2. **HIGH-01, HIGH-02, HIGH-03** — 全ページでの `escapeHtml` 適用（XSS修正）
3. **HIGH-05** — オープンリダイレクトの修正
4. **MED-04** — edit.html のテンプレートインジェクション修正

### Phase 2: 短期対応（1週間）
5. **HIGH-04** — Issues API の認可チェック強化
6. **MED-03** — エラーメッセージのサニタイズ
7. **LOW-02** — logout処理の統一

### Phase 3: 中期対応（2-4週間）
8. **CRIT-01** — JWT/セッション認証の実装
9. **CRIT-02** — サーバーサイド認可チェックの徹底（管理者UIの保護）
10. **MED-01** — パスワードハッシュのソルト対応
11. **MED-02** — CSRF対策の実装

### Phase 4: 長期改善
12. **LOW-01** — ユーティリティ関数のXSS対策
13. **LOW-03** — Rate Limiting の導入
14. CORSポリシーの明示的設定
15. Content Security Policy (CSP) ヘッダーの追加
16. セキュリティヘッダー (X-Frame-Options, X-Content-Type-Options等) の追加

---

## 備考

- 本診断はソースコードの静的解析に基づいています
- プロトタイプ段階であることを考慮し、実装工数とリスクのバランスを重視したレーティングを採用しています
- Cloudflare Pages/Workers の基盤的なセキュリティ（DDoS保護、TLS等）は今回のスコープ外です
- データベース（D1）のバインドパラメータ(`.bind()`)が一貫して使用されており、**SQLインジェクションのリスクは低い**と判断しました ✅
