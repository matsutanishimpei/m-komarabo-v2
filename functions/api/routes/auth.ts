import { Hono } from 'hono'
import type { Env } from '../types'
import { hashPassword } from '../utils/hash'

const auth = new Hono<Env>()

// ログイン・登録API
auth.post('/login', async (c) => {
  const { user_hash, password } = await c.req.json()
  const password_hash = await hashPassword(password)
  const session_token = crypto.randomUUID()

  // ユーザーの存在確認
  const existingUser = await c.env.DB.prepare(
    'SELECT * FROM users WHERE user_hash = ?'
  ).bind(user_hash).first()

  if (!existingUser) {
    /* 
     * 本来は登録とログインは分けるべきですが、
     * プロトタイプとして簡略化のため、存在しない場合は自動登録します。
     */
    try {
      await c.env.DB.prepare(
        'INSERT INTO users (user_hash, password_hash, role, session_token) VALUES (?, ?, ?, ?)'
      ).bind(user_hash, password_hash, 'requester', session_token).run()

      return c.json({
        success: true,
        isNew: true,
        message: '新規登録・ログインしました',
        user_hash: user_hash,
        auth_token: session_token
      })
    } catch (e) {
      return c.json({ success: false, message: '登録に失敗しました' }, 500)
    }
  }

  // 既存ユーザーの認証（ハッシュ比較のみ。平文フォールバックは削除済み）
  if (existingUser.password_hash !== password_hash) {
    return c.json({ success: false, message: 'パスワードが違います' }, 401)
  }

  // セッショントークンを更新
  await c.env.DB.prepare(
    'UPDATE users SET session_token = ? WHERE id = ?'
  ).bind(session_token, existingUser.id).run()

  return c.json({
    success: true,
    isNew: false,
    message: 'ログインしました',
    user_hash: existingUser.user_hash,
    auth_token: session_token
  })
})

export { auth }
