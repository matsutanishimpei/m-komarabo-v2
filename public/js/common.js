/**
 * 共通ユーティリティ関数
 * 全てのページで使用する共通機能を提供
 * Google OAuth + JWT Cookie 認証対応
 */

// ========================================
// セキュリティ
// ========================================

/**
 * HTML特殊文字をエスケープ（XSS防止）
 * @param {string} unsafe - エスケープ対象の文字列
 * @returns {string} エスケープ済み文字列
 */
export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ========================================
// 認証関連（Cookie JWT ベース）
// ========================================

// 認証ユーザーのキャッシュ（ページ内で繰り返しAPI呼び出しを避ける）
let _cachedUser = null;
let _authChecked = false;

/**
 * 認証状態を確認して、ユーザー情報を取得
 * JWTはHttpOnly Cookieとして自動送信されるので、サーバーに確認する
 * @returns {Promise<Object|null>} ユーザー情報 or null
 */
export async function fetchAuthUser() {
    if (_authChecked && _cachedUser) return _cachedUser;

    try {
        const res = await fetch('/api/auth/me', {
            credentials: 'same-origin'
        });

        if (!res.ok) {
            _authChecked = true;
            _cachedUser = null;
            return null;
        }

        const data = await res.json();
        if (data.authenticated && data.user) {
            _cachedUser = data.user;
            _authChecked = true;
            return data.user;
        }

        _authChecked = true;
        _cachedUser = null;
        return null;
    } catch (err) {
        console.error('認証チェックエラー:', err);
        _authChecked = true;
        _cachedUser = null;
        return null;
    }
}

/**
 * ログイン状態をチェック（リダイレクト付き）
 * @param {boolean} required - ログインが必須かどうか
 * @param {string} redirectTheme - リダイレクト先のテーマ ('komarabo' | 'wakuwaku')
 * @returns {Promise<Object|null>} ユーザー情報 or null
 */
export async function checkAuth(required = true, redirectTheme = 'komarabo') {
    const user = await fetchAuthUser();

    if (!user) {
        if (required) {
            const currentPath = encodeURIComponent(location.pathname + location.search);
            const hash = redirectTheme === 'wakuwaku' ? '#wakuwaku' : '#komarabo';
            location.href = `/login.html?redirect_to=${currentPath}${hash}`;
            // リダイレクト完了までUIを表示させないために永遠に待機するPromiseを返す
            return new Promise(() => { });
        }
        document.body.style.visibility = 'visible';
        document.body.style.opacity = '1';
        return null;
    }

    document.body.style.visibility = 'visible';
    document.body.style.opacity = '1';
    return user;
}

/**
 * ログアウト処理
 * @param {string} redirectUrl - ログアウト後のリダイレクト先
 */
export async function logout(redirectUrl = '/index.html') {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
        });
    } catch (e) {
        // ログアウトAPI失敗してもリダイレクトする
    }
    _cachedUser = null;
    _authChecked = false;
    location.href = redirectUrl;
}

/**
 * 現在のユーザーが管理者かどうかを返す
 * @returns {Promise<boolean>}
 */
export async function isAdmin() {
    const user = await fetchAuthUser();
    return !!(user && user.role === 'admin');
}

/**
 * 管理者権限をサーバー側で検証（API呼び出し）
 * @returns {Promise<boolean>}
 */
export async function checkAdminServer() {
    try {
        const res = await fetch('/api/admin/check', {
            credentials: 'same-origin'
        });

        if (!res.ok) return false;
        const data = await res.json();
        return data.is_admin === true;
    } catch (err) {
        console.error('管理者チェックエラー:', err);
        return false;
    }
}

// ========================================
// UI関連
// ========================================

/**
 * ユーザー名を表示
 * @param {string} elementId - 表示先の要素ID
 */
export async function displayUserName(elementId = 'display_user_name') {
    const user = await fetchAuthUser();
    if (!user) return;

    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = user.display_name;
    }
}

/**
 * ローディング表示
 * @param {string} elementId - 表示先の要素ID
 * @param {string} message - ローディングメッセージ
 */
export function showLoading(elementId, message = '読み込み中...') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'text-center py-20';
        const p = document.createElement('p');
        p.className = 'text-gray-400';
        p.textContent = message;
        wrapper.appendChild(p);
        element.appendChild(wrapper);
    }
}

/**
 * エラー表示
 * @param {string} elementId - 表示先の要素ID
 * @param {string} message - エラーメッセージ
 */
export function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'text-center py-20';
        const p = document.createElement('p');
        p.className = 'text-red-400';
        p.textContent = message;
        wrapper.appendChild(p);
        element.appendChild(wrapper);
    }
}

// ========================================
// API関連
// ========================================

/**
 * APIリクエストのラッパー（Cookie認証対応）
 * @param {string} endpoint - APIエンドポイント
 * @param {Object} options - fetchオプション
 * @returns {Promise<Object>}
 */
export async function apiRequest(endpoint, options = {}) {
    try {
        const res = await fetch(endpoint, {
            credentials: 'same-origin', // Cookie を自動送信
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        const data = await res.json();

        if (!res.ok) {
            // 認証エラーならログインページにリダイレクト
            if (res.status === 401) {
                _cachedUser = null;
                _authChecked = false;
                const currentPath = encodeURIComponent(location.pathname + location.search);
                location.href = `/login.html?redirect_to=${currentPath}`;
                throw new Error('Authentication required');
            }
            throw new Error(data.message || data.error || `API Error: ${res.status}`);
        }

        return data;
    } catch (err) {
        console.error(`API Request Error (${endpoint}):`, err);
        throw err;
    }
}

/**
 * 管理者専用APIリクエスト
 * @param {string} endpoint - APIエンドポイント
 * @param {Object} body - リクエストボディ
 * @returns {Promise<Object>}
 */
export async function adminApiRequest(endpoint, body = null) {
    const options = {};
    if (body) {
        options.method = 'POST';
        options.body = JSON.stringify(body);
    } else {
        options.method = 'GET';
    }
    return apiRequest(endpoint, options);
}

// ========================================
// 日付フォーマット
// ========================================

/**
 * 日付を日本語形式でフォーマット
 * @param {string|Date} date - 日付
 * @returns {string}
 */
export function formatDate(date) {
    return new Date(date).toLocaleDateString('ja-JP');
}

/**
 * 日付を詳細形式でフォーマット
 * @param {string|Date} date - 日付
 * @returns {string}
 */
export function formatDateTime(date) {
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ========================================
// バリデーション
// ========================================

/**
 * 空文字チェック
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @returns {boolean}
 */
export function validateRequired(value, fieldName) {
    if (!value || value.trim() === '') {
        alert(`${fieldName}は必須です`);
        return false;
    }
    return true;
}

/**
 * URLバリデーション
 * @param {string} url - チェックするURL
 * @returns {boolean}
 */
export function validateUrl(url) {
    if (!url) return true; // 空の場合はOK（任意項目）

    try {
        new URL(url);
        return true;
    } catch {
        alert('有効なURLを入力してください');
        return false;
    }
}
