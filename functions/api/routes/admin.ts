import { Hono } from 'hono'
import type { Env } from '../types'

const admin = new Hono<Env>()

// 管理者チェックAPI
admin.post('/check', async (c) => {
  try {
    const { user_hash } = await c.req.json()

    const user = await c.env.DB.prepare(
      'SELECT is_admin FROM users WHERE user_hash = ?'
    ).bind(user_hash).first()

    return c.json({
      is_admin: user?.is_admin === 1
    })
  } catch (err) {
    console.error('Error checking admin:', err)
    return c.json({ is_admin: false }, 500)
  }
})

// 統計情報API
admin.post('/stats', async (c) => {
  try {
    const { user_hash } = await c.req.json()

    const user = await c.env.DB.prepare(
      'SELECT is_admin FROM users WHERE user_hash = ?'
    ).bind(user_hash).first()

    if (!user || user.is_admin !== 1) {
      return c.json({ error: 'Unauthorized' }, 403)
    }

    const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first()
    const issueCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM issues').first()
    const productCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM products').first()
    const commentCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM comments').first()

    return c.json({
      users: userCount?.count || 0,
      issues: issueCount?.count || 0,
      products: productCount?.count || 0,
      comments: commentCount?.count || 0
    })
  } catch (err) {
    console.error('Error fetching stats:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: errorMessage }, 500)
  }
})

// ユーザー一覧API
admin.post('/users', async (c) => {
  try {
    const { user_hash } = await c.req.json()

    const user = await c.env.DB.prepare(
      'SELECT is_admin FROM users WHERE user_hash = ?'
    ).bind(user_hash).first()

    if (!user || user.is_admin !== 1) {
      return c.json({ error: 'Unauthorized' }, 403)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT user_hash, created_at, is_admin
      FROM users
      ORDER BY created_at DESC
    `).all()

    return c.json({ users: results })
  } catch (err) {
    console.error('Error fetching users:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: errorMessage }, 500)
  }
})

// 最近の投稿API
admin.post('/recent-activity', async (c) => {
  try {
    const { user_hash } = await c.req.json()

    const user = await c.env.DB.prepare(
      'SELECT is_admin FROM users WHERE user_hash = ?'
    ).bind(user_hash).first()

    if (!user || user.is_admin !== 1) {
      return c.json({ error: 'Unauthorized' }, 403)
    }

    const issues = await c.env.DB.prepare(`
      SELECT 
        issues.title,
        issues.created_at,
        users.user_hash,
        'コマラボ' as type
      FROM issues
      JOIN users ON issues.user_id = users.id
      ORDER BY issues.created_at DESC
      LIMIT 5
    `).all()

    const products = await c.env.DB.prepare(`
      SELECT 
        products.title,
        products.created_at,
        users.user_hash,
        'ワクワク' as type
      FROM products
      JOIN users ON products.creator_id = users.id
      ORDER BY products.created_at DESC
      LIMIT 5
    `).all()

    const activities = [...issues.results, ...products.results]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)

    return c.json({ activities })
  } catch (err) {
    console.error('Error fetching recent activity:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: errorMessage }, 500)
  }
})

// ベースプロンプト更新API（管理者用）
admin.post('/update-base-prompt', async (c) => {
  try {
    const { prompt, user_hash } = await c.req.json()

    const user = await c.env.DB.prepare(
      'SELECT is_admin FROM users WHERE user_hash = ?'
    ).bind(user_hash).first()

    if (!user || user.is_admin !== 1) {
      return c.json({ success: false, message: '管理者権限が必要です' }, 403)
    }

    await c.env.DB.prepare(`
      UPDATE site_configs 
      SET value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE key = 'wakuwaku_base_prompt'
    `).bind(prompt).run()

    return c.json({ success: true, message: 'ベースプロンプトを更新しました' })
  } catch (err) {
    console.error('Error updating base prompt:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ success: false, message: errorMessage }, 500)
  }
})

export { admin }
