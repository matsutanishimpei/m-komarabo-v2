import { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Bindings, Variables, AuthUser, JwtPayload } from './types';
import * as jose from 'jose';

// ========================================
// JWT ユーティリティ
// ========================================

const AUTH_COOKIE_NAME = 'auth_token';
const NONCE_COOKIE_NAME = 'oauth_nonce';
const JWT_EXPIRY = '7d';

/**
 * JWTトークンを生成
 */
export async function createJwt(
    secret: string,
    payload: Omit<JwtPayload, 'iat' | 'exp'>
): Promise<string> {
    const secretKey = new TextEncoder().encode(secret);
    return await new jose.SignJWT(payload as unknown as jose.JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRY)
        .sign(secretKey);
}

/**
 * JWTトークンを検証
 */
export async function verifyJwt(
    secret: string,
    token: string
): Promise<JwtPayload | null> {
    try {
        const secretKey = new TextEncoder().encode(secret);
        const { payload } = await jose.jwtVerify(token, secretKey);
        return payload as unknown as JwtPayload;
    } catch {
        return null;
    }
}

/**
 * JWT Cookie を設定（Hono cookie ヘルパー使用）
 */
export function setAuthCookie(c: Context, token: string): void {
    setCookie(c, AUTH_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60,
    });
}

/**
 * JWT Cookie を削除
 */
export function clearAuthCookie(c: Context): void {
    deleteCookie(c, AUTH_COOKIE_NAME, {
        path: '/',
        secure: true,
    });
}

/**
 * Cookie からトークンを取得
 */
export function getTokenFromCookie(c: Context): string | null {
    return getCookie(c, AUTH_COOKIE_NAME) ?? null;
}

// ========================================
// OAuth nonce（CSRF対策）
// ========================================

/**
 * OAuth nonce Cookie を設定（5分で失効）
 * RFC 6749 Section 10.12 準拠の CSRF 対策
 */
export function setNonceCookie(c: Context, nonce: string): void {
    setCookie(c, NONCE_COOKIE_NAME, nonce, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 300, // 5分
    });
}

/**
 * OAuth nonce Cookie を取得
 */
export function getNonceCookie(c: Context): string | null {
    return getCookie(c, NONCE_COOKIE_NAME) ?? null;
}

/**
 * OAuth nonce Cookie を削除（使用後に必ず消す）
 */
export function clearNonceCookie(c: Context): void {
    deleteCookie(c, NONCE_COOKIE_NAME, {
        path: '/',
        secure: true,
    });
}

// ========================================
// UUID生成
// ========================================

/**
 * UUIDv4を生成
 */
export function generateUUID(): string {
    return crypto.randomUUID();
}

// ========================================
// ミドルウェア
// ========================================

/**
 * JWT認証ミドルウェア
 * すべての保護されたルートで使用
 * c.get('user') で AuthUser にアクセス可能にする
 */
export async function authMiddleware(
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
    next: Next
): Promise<Response | void> {
    const token = getTokenFromCookie(c);

    if (!token) {
        return c.json({ error: '認証が必要です', code: 'AUTH_REQUIRED' }, 401);
    }

    const payload = await verifyJwt(c.env.JWT_SECRET, token);
    if (!payload) {
        clearAuthCookie(c);
        return c.json({ error: 'トークンが無効です', code: 'INVALID_TOKEN' }, 401);
    }

    // DB で is_active を確認（管理者による即時無効化を反映するため）
    const dbUser = await c.env.DB.prepare(
        'SELECT is_active FROM users WHERE id = ?'
    ).bind(payload.id).first<{ is_active: number }>();

    if (!dbUser || dbUser.is_active === 0) {
        clearAuthCookie(c); // 無効化済みのため Cookie も削除
        return c.json({ error: 'このアカウントは無効化されています', code: 'ACCOUNT_DISABLED' }, 403);
    }

    const user: AuthUser = {
        id: payload.id,
        display_name: payload.display_name,
        role: payload.role,
        sub: payload.sub,
    };

    c.set('user', user);
    await next();
}

/**
 * 管理者専用ミドルウェア
 * authMiddleware の後に使用
 */
export async function adminGuard(
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
    next: Next
): Promise<Response | void> {
    const user = c.get('user');

    if (!user || user.role !== 'admin') {
        return c.json({ error: '管理者権限が必要です', code: 'ADMIN_REQUIRED' }, 403);
    }

    await next();
}
