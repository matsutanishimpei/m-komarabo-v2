import { Hono } from 'hono'
import type { Env } from '../types'
import { hashPassword } from '../utils/hash'

const auth = new Hono<Env>()

// ログイン・登録API
auth.post('/login', async (c) => {
  const { user_hash, password } = await c.req.json()
  const password_hash = await hashPassword(password)

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
        'INSERT INTO users (user_hash, password_hash, role) VALUES (?, ?, ?)'
      ).bind(user_hash, password_hash, 'requester').run()

      return c.json({
        success: true,
        isNew: true,
        message: '新規登録・ログインしました',
        user_hash: user_hash,
        auth_token: 'dummy_token_' + Date.now()
      })
    } catch (e) {
      return c.json({ success: false, message: '登録に失敗しました' }, 500)
    }
  }

  // 既存ユーザーの認証
  if (existingUser.password_hash === password_hash || existingUser.password_hash === password) {
    return c.json({
      success: true,
      isNew: false,
      message: 'ログインしました',
      user_hash: existingUser.user_hash,
      auth_token: 'dummy_token_' + Date.now()
    })
  } else {
    return c.json({ success: false, message: 'パスワードが違います' }, 401)
  }
})

export { auth }
