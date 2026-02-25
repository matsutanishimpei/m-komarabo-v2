import { Hono } from 'hono';
import { Bindings, Variables } from './types';
import {
    createJwt,
    setAuthCookie,
    clearAuthCookie,
    generateUUID,
    authMiddleware,
    getTokenFromCookie,
    verifyJwt,
    setNonceCookie,
    getNonceCookie,
    clearNonceCookie,
} from './helpers';

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ========================================
// Google OAuth ログインフロー
// ========================================

/**
 * Step 1: Google OAuth 認可URL へリダイレクト
 * GET /api/auth/google
 */
auth.get('/google', (c) => {
    const redirectUri = c.env.GOOGLE_REDIRECT_URI;
    const clientId = c.env.GOOGLE_CLIENT_ID;

    // state パラメータでCSRF防止（RFC 6749 Section 10.12 準拠）
    // nonce: 推測不可能な乱数。Cookie にも同じ値を保存しコールバックで照合する
    const redirectTo = c.req.query('redirect_to') || '/komarabo/index.html';
    const nonce = crypto.randomUUID();
    const state = btoa(JSON.stringify({ redirect_to: redirectTo, nonce }));

    // nonce を HttpOnly Cookie に保存（5分で失効）
    setNonceCookie(c, nonce);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'online');
    authUrl.searchParams.set('prompt', 'select_account');

    return c.redirect(authUrl.toString());
});

/**
 * Step 2: Google コールバック処理
 * GET /api/auth/callback
 * - 認可コードを受け取り、トークンに交換
 * - ユーザー情報を取得してUpsert
 * - JWT Cookie を発行
 */
auth.get('/callback', async (c) => {
    const code = c.req.query('code');
    const stateParam = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
        console.error('[auth/callback] Google OAuth Error:', error);
        return c.redirect('/login.html?error=oauth_denied');
    }

    if (!code) {
        return c.redirect('/login.html?error=no_code');
    }

    // ========================================
    // CSRF 検証（RFC 6749 Section 10.12 準拠）
    // nonce Cookie と state の nonce を照合する
    // ========================================
    const cookieNonce = getNonceCookie(c);
    clearNonceCookie(c); // 一度読んだらすぐ削除（リプレイ攻撃防止）

    if (!cookieNonce) {
        // Cookie がない = このブラウザはログインフローを開始していない
        console.warn('[auth/callback] CSRF: oauth_nonce Cookie が見つかりません');
        return c.redirect('/login.html?error=csrf_detected');
    }

    // リダイレクト先の復元 + nonce 検証
    let redirectTo = '/komarabo/index.html';
    if (stateParam) {
        try {
            const stateData = JSON.parse(atob(stateParam));

            // nonce の一致確認
            if (stateData.nonce !== cookieNonce) {
                console.warn('[auth/callback] CSRF: nonce 不一致（Login CSRF の疑い）');
                return c.redirect('/login.html?error=csrf_detected');
            }

            if (stateData.redirect_to && stateData.redirect_to.startsWith('/') && !stateData.redirect_to.startsWith('//')) {
                redirectTo = stateData.redirect_to;
            }
        } catch {
            // state のパースに失敗 = 不正な state
            console.warn('[auth/callback] CSRF: state のパースに失敗');
            return c.redirect('/login.html?error=csrf_detected');
        }
    } else {
        // state なし = CSRF 対策なしのリクエスト
        console.warn('[auth/callback] CSRF: state パラメータがありません');
        return c.redirect('/login.html?error=csrf_detected');
    }

    try {
        // 1. 認可コードをアクセストークンに交換
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: c.env.GOOGLE_CLIENT_ID,
                client_secret: c.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: c.env.GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenRes.ok) {
            const errBody = await tokenRes.text();
            console.error('[auth/callback] Token exchange failed:', errBody);
            return c.redirect('/login.html?error=token_exchange_failed');
        }

        const tokenData = await tokenRes.json() as { access_token: string; id_token: string };

        // 2. Google ユーザー情報を取得
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userInfoRes.ok) {
            console.error('[auth/callback] UserInfo fetch failed');
            return c.redirect('/login.html?error=userinfo_failed');
        }

        const googleUser = await userInfoRes.json() as {
            sub: string;
            email: string;
            name: string;
            picture: string;
        };

        // 3. Upsert: google_sub をキーにDBを検索
        const existingUser = await c.env.DB.prepare(
            'SELECT id, display_name, role, is_profile_completed FROM users WHERE google_sub = ?'
        ).bind(googleUser.sub).first<{
            id: string;
            display_name: string;
            role: string;
            is_profile_completed: number;
        }>();

        let userId: string;
        let displayName: string;
        let role: string;

        if (!existingUser) {
            // 新規ユーザー: UUID を発行して作成
            userId = generateUUID();
            displayName = googleUser.name;

            // 管理者メールは環境変数（Cloudflare Secret）から取得
            // ADMIN_EMAILS にカンマ区切りで設定: "a@example.com,b@example.com"
            const adminEmails = (c.env.ADMIN_EMAILS || '')
                .split(',')
                .map((e: string) => e.trim().toLowerCase())
                .filter((e: string) => e.length > 0);
            role = adminEmails.includes(googleUser.email.toLowerCase()) ? 'admin' : 'user';

            await c.env.DB.prepare(`
                INSERT INTO users (id, google_sub, email, display_name, avatar_url, role, is_profile_completed)
                VALUES (?, ?, ?, ?, ?, ?, FALSE)
            `).bind(userId, googleUser.sub, googleUser.email, displayName, googleUser.picture, role).run();

            console.log(`[auth/callback] 新規ユーザー作成: ${userId} (${role})`);
        } else {
            // 既存ユーザー: email と avatar_url を最新に更新
            userId = existingUser.id;
            role = existingUser.role;

            if (existingUser.is_profile_completed) {
                // プロフィール完了済み: display_name は上書きしない
                displayName = existingUser.display_name;
                await c.env.DB.prepare(`
                    UPDATE users SET email = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).bind(googleUser.email, googleUser.picture, userId).run();
            } else {
                // 未完了: display_name も Google から更新
                displayName = googleUser.name;
                await c.env.DB.prepare(`
                    UPDATE users SET email = ?, display_name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).bind(googleUser.email, displayName, googleUser.picture, userId).run();
            }

            console.log(`[auth/callback] 既存ユーザー更新: ${userId}`);
        }

        // 4. JWT 発行
        const token = await createJwt(c.env.JWT_SECRET, {
            sub: googleUser.sub,
            id: userId,
            display_name: displayName,
            role,
        });

        // 5. HttpOnly Cookie に設定してリダイレクト
        setAuthCookie(c, token);
        return c.redirect(redirectTo);

    } catch (err) {
        console.error('[auth/callback] 処理エラー:', err);
        return c.redirect('/login.html?error=internal');
    }
});

// ========================================
// 認証状態チェック API
// ========================================

/**
 * GET /api/auth/me
 * フロントエンドが認証状態を確認するためのエンドポイント
 * JWTの中身（id, display_name, role）を返す
 * ※ sub はフロントに返さない
 */
auth.get('/me', async (c) => {
    const token = getTokenFromCookie(c);
    if (!token) {
        return c.json({ authenticated: false }, 401);
    }

    const payload = await verifyJwt(c.env.JWT_SECRET, token);
    if (!payload) {
        clearAuthCookie(c);
        return c.json({ authenticated: false }, 401);
    }

    // DBから最新情報を取得
    const user = await c.env.DB.prepare(
        'SELECT id, display_name, email, role, avatar_url, is_profile_completed, created_at FROM users WHERE id = ?'
    ).bind(payload.id).first<{
        id: string;
        display_name: string;
        email: string;
        role: string;
        avatar_url: string | null;
        is_profile_completed: number;
        created_at: string;
    }>();

    if (!user) {
        clearAuthCookie(c);
        return c.json({ authenticated: false }, 401);
    }

    return c.json({
        authenticated: true,
        user: {
            id: user.id,
            display_name: user.display_name,
            email: user.email,
            role: user.role,
            avatar_url: user.avatar_url,
            is_profile_completed: !!user.is_profile_completed,
            created_at: user.created_at,
        },
    });
});

// ========================================
// プロフィール更新 API
// ========================================

/**
 * POST /api/auth/profile
 * display_name を変更し、is_profile_completed を true にしてJWT再発行
 */
auth.post('/profile', authMiddleware, async (c) => {
    const user = c.get('user');
    const { display_name } = await c.req.json<{ display_name: string }>();

    if (!display_name || !display_name.trim()) {
        return c.json({ success: false, message: '表示名を入力してください' }, 400);
    }

    const trimmedName = display_name.trim();
    if (trimmedName.length > 50) {
        return c.json({ success: false, message: '表示名は50文字以内にしてください' }, 400);
    }

    // DB更新: display_name と is_profile_completed
    await c.env.DB.prepare(`
        UPDATE users SET display_name = ?, is_profile_completed = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).bind(trimmedName, user.id).run();

    // JWT再発行（新しいdisplay_nameで）
    const newToken = await createJwt(c.env.JWT_SECRET, {
        sub: user.sub,
        id: user.id,
        display_name: trimmedName,
        role: user.role,
    });

    setAuthCookie(c, newToken);

    return c.json({
        success: true,
        message: 'プロフィールを更新しました',
        user: {
            id: user.id,
            display_name: trimmedName,
            role: user.role,
        },
    });
});

// ========================================
// ログアウト
// ========================================

/**
 * POST /api/auth/logout
 * Cookie を削除してログアウト
 */
auth.post('/logout', (c) => {
    clearAuthCookie(c);
    return c.json({ success: true, message: 'ログアウトしました' });
});

// ========================================
// エラーハンドラ
// ========================================

auth.onError((err, c) => {
    console.error('[auth] 未処理エラー:', err);
    return c.json({ success: false, message: 'サーバーエラーが発生しました' }, 500);
});

export default auth;
