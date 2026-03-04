/**
 * 共通ユーティリティ関数
 * 全てのページで使用する共通機能を提供
 */

// ========================================
// 認証関連
// ========================================

/**
 * ログイン状態をチェック
 * @param {boolean} required - ログインが必須かどうか
 * @param {string} redirectTheme - リダイレクト先のテーマ ('komarabo' | 'wakuwaku')
 * @returns {Object|null} ユーザー情報 or null
 */
export function checkAuth(required = true, redirectTheme = 'komarabo') {
    const userHash = localStorage.getItem('user_hash');
    const authToken = localStorage.getItem('auth_token');

    if (!userHash || !authToken) {
        if (required) {
            const redirectUrl = redirectTheme === 'wakuwaku' ? 'login.html#wakuwaku' : 'login.html#komarabo';
            location.href = redirectUrl;
            throw new Error('Not logged in');
        }
        return null;
    }

    return { userHash, authToken };
}

/**
 * ログアウト処理
 * @param {string} redirectUrl - ログアウト後のリダイレクト先
 */
export function logout(redirectUrl = 'index.html') {
    localStorage.removeItem('user_hash');
    localStorage.removeItem('auth_token');
    alert('ログアウトしました');
    location.href = redirectUrl;
}

/**
 * 管理者権限をチェック
 * @returns {Promise<boolean>}
 */
export async function checkAdmin() {
    const auth = checkAuth(true);
    if (!auth) return false;

    try {
        const res = await fetch('/api/admin/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_hash: auth.userHash })
        });

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
export function displayUserName(elementId = 'display_user_hash') {
    const auth = checkAuth(false);
    if (!auth) return;

    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = auth.userHash;
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
        element.innerHTML = `
            <div class="text-center py-20">
                <p class="text-gray-400">${message}</p>
            </div>
        `;
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
        element.innerHTML = `
            <div class="text-center py-20">
                <p class="text-red-400">${message}</p>
            </div>
        `;
    }
}

// ========================================
// API関連
// ========================================

/**
 * APIリクエストのラッパー（自動リトライ＆タイムアウト付き）
 * @param {string} endpoint - APIエンドポイント
 * @param {Object} options - fetchオプション
 * @param {number} retries - リトライ回数（デフォルト3回）
 * @param {number} timeout - タイムアウトミリ秒（デフォルト10秒）
 * @returns {Promise<Object>}
 */
export async function apiRequest(endpoint, options = {}, retries = 3, timeout = 10000) {
    let lastError;
    
    // オフラインチェック
    if (!navigator.onLine) {
        throw new Error('ネットワークに接続されていません。通信環境を確認してください。');
    }

    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const res = await fetch(endpoint, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);

            const data = await res.json();

            if (!res.ok) {
                // 4xxエラーなどはリトライしないようにする
                if (res.status >= 400 && res.status < 500) {
                    throw new Error(data.message || `API Error: ${res.status}`);
                }
                throw new Error(data.message || `Server Error: ${res.status}`);
            }

            return data;
        } catch (err) {
            clearTimeout(id);
            lastError = err;
            
            // AbortError(タイムアウト) または ネットワークエラーの場合はリトライ
            if (err.name === 'AbortError' || err.message === 'Failed to fetch') {
                console.warn(`[リトライ ${i + 1}/${retries}] ${endpoint} - ${err.message}`);
                // エクスポネンシャルバックオフ (1秒 -> 2秒 -> 4秒...)
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
                }
                continue;
            }
            
            // それ以外（バリデーションエラーなど4xx系）はそのまま投げる
            throw err;
        }
    }

    throw new Error(`通信に失敗しました。時間をおいて再試行してください。（詳細: ${lastError.message}）`);
}

/**
 * 管理者専用APIリクエスト
 * @param {string} endpoint - APIエンドポイント
 * @param {Object} body - リクエストボディ
 * @returns {Promise<Object>}
 */
export async function adminApiRequest(endpoint, body = {}) {
    const auth = checkAuth(true);
    if (!auth) throw new Error('Not authenticated');

    return apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
            user_hash: auth.userHash,
            ...body
        })
    });
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

// ========================================
// ボタン状態管理
// ========================================

/**
 * ボタンのローディング状態（連打防止）を設定
 * @param {HTMLElement} button - 対象のボタン要素
 * @param {boolean} isLoading - ローディング中かどうか
 * @param {string} loadingText - ローディング中に表示するテキスト
 */
export function setButtonLoading(button, isLoading, loadingText = '処理中...') {
    if (!button) return;

    if (isLoading) {
        // 現在のテキストを保存
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.innerHTML;
        }
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-not-allowed');
        button.innerHTML = `
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            ${loadingText}
        `;
    } else {
        button.disabled = false;
        button.classList.remove('opacity-70', 'cursor-not-allowed');
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
        }
    }
}
