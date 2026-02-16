import { Context } from 'hono';
import { Bindings } from './types';

// ========================================
// 共通ヘルパー関数
// ========================================

/**
 * user_hash からユーザーIDを取得
 */
export async function getUserByHash(
    c: Context<{ Bindings: Bindings }>,
    user_hash: string
): Promise<{ id: number; is_admin: number } | null> {
    return c.env.DB.prepare(
        'SELECT id, is_admin FROM users WHERE user_hash = ?'
    ).bind(user_hash).first<{ id: number; is_admin: number }>();
}

/**
 * 管理者権限を検証
 * is_admin フラグのみで判定する（一元管理）
 */
export async function verifyAdmin(
    c: Context<{ Bindings: Bindings }>,
    user_hash: string
): Promise<boolean> {
    const user = await c.env.DB.prepare(
        'SELECT is_admin FROM users WHERE user_hash = ?'
    ).bind(user_hash).first<{ is_admin: number }>();
    return !!(user && user.is_admin === 1);
}
