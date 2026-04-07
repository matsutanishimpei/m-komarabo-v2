import { createMiddleware } from 'hono/factory'
import type { Env } from '../types'

/**
 * 認証ミドルウェア
 * Authorization: Bearer <token> ヘッダーを検証し、ユーザー情報をコンテキストにセットする
 */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, message: '認証が必要です' }, 401)
  }

  const token = authHeader.slice(7)
  const user = await c.env.DB.prepare(
    'SELECT id, user_hash, is_admin FROM users WHERE session_token = ?'
  ).bind(token).first()

  if (!user) {
    return c.json({ success: false, message: '無効なトークンです。再ログインしてください。' }, 401)
  }

  c.set('user', user as { id: number; user_hash: string; is_admin: number })
  await next()
})

/**
 * 管理者権限ミドルウェア
 * requireAuth の後に使用すること
 */
export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  const user = c.get('user')
  if (!user || user.is_admin !== 1) {
    return c.json({ success: false, message: '管理者権限が必要です' }, 403)
  }
  await next()
})
