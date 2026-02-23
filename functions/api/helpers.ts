import { Context, Next } from 'hono';
import { Bindings, Variables, AuthUser, JwtPayload } from './types';
import * as jose from 'jose';

// ========================================
// JWT ユーティリティ
// ========================================

const COOKIE_NAME = 'auth_token';
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
 * JWT Cookie を設定
 */
export function setAuthCookie(c: Context, token: string): void {
    // Cloudflare Pages では HTTPS が保証される
    c.header('Set-Cookie',
        `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );
}

/**
 * JWT Cookie を削除
 */
export function clearAuthCookie(c: Context): void {
    c.header('Set-Cookie',
        `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
    );
}

/**
 * Cookie からトークンを取得
 */
export function getTokenFromCookie(c: Context): string | null {
    const cookieHeader = c.req.header('Cookie');
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const cookie of cookies) {
        const [name, ...rest] = cookie.split('=');
        if (name === COOKIE_NAME) {
            return rest.join('=');
        }
    }
    return null;
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
