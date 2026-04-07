import { Hono } from 'hono'
import type { Env } from '../types'

const wakuwaku = new Hono<Env>()

// ベースプロンプト取得API
wakuwaku.get('/base-prompt', async (c) => {
  try {
    const config = await c.env.DB.prepare(
      'SELECT value FROM site_configs WHERE key = ?'
    ).bind('wakuwaku_base_prompt').first()

    return c.json({
      success: true,
      prompt: config?.value || 'プロンプトが設定されていません'
    })
  } catch (err) {
    console.error('Error fetching base prompt:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ success: false, message: 'プロンプトの取得に失敗しました: ' + errorMessage }, 500)
  }
})

// プロダクト一覧取得API
wakuwaku.get('/products', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      products.*,
      users.user_hash as creator_user_hash
    FROM products
    JOIN users ON products.creator_id = users.id
    WHERE products.status = 'published'
    ORDER BY products.created_at DESC
  `).all()

  return c.json(results || [])
})

// プロダクト詳細取得API
wakuwaku.get('/product/:id', async (c) => {
  const id = c.req.param('id')

  const product = await c.env.DB.prepare(`
    SELECT 
      products.*,
      users.user_hash as creator_user_hash
    FROM products
    JOIN users ON products.creator_id = users.id
    WHERE products.id = ?
  `).bind(id).first()

  if (!product) {
    return c.json({ message: 'プロダクトが見つかりません' }, 404)
  }

  return c.json(product)
})

// プロダクト投稿API
wakuwaku.post('/post-product', async (c) => {
  try {
    const { title, url, initial_prompt_log, dev_obsession, user_hash } = await c.req.json()

    if (!title || !initial_prompt_log) {
      return c.json({ success: false, message: 'タイトルと初期衝動履歴は必須です' }, 400)
    }

    const user = await c.env.DB.prepare(
      'SELECT id FROM users WHERE user_hash = ?'
    ).bind(user_hash).first()

    if (!user) {
      return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404)
    }

    await c.env.DB.prepare(`
      INSERT INTO products (creator_id, title, url, initial_prompt_log, dev_obsession, sealed_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(user.id, title, url || null, initial_prompt_log, dev_obsession || null).run()

    return c.json({ success: true, message: 'プロダクトを投稿しました！' })
  } catch (err) {
    console.error('Error posting product:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ success: false, message: 'プロダクトの投稿に失敗しました: ' + errorMessage }, 500)
  }
})

// プロダクト更新API（initial_prompt_logは更新不可）
wakuwaku.post('/update-product', async (c) => {
  const { id, title, url, dev_obsession, user_hash } = await c.req.json()

  const existingProduct = await c.env.DB.prepare(`
    SELECT products.*, users.user_hash
    FROM products
    JOIN users ON products.creator_id = users.id
    WHERE products.id = ?
  `).bind(id).first()

  if (!existingProduct) {
    return c.json({ success: false, message: 'プロダクトが見つかりません' }, 404)
  }

  if (existingProduct.user_hash !== user_hash) {
    return c.json({ success: false, message: '自分の投稿のみ編集できます' }, 403)
  }

  await c.env.DB.prepare(`
    UPDATE products 
    SET title = ?, url = ?, dev_obsession = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(title, url || null, dev_obsession || null, id).run()

  return c.json({ success: true, message: 'プロダクトを更新しました' })
})

// プロダクト削除API
wakuwaku.post('/delete-product', async (c) => {
  try {
    const { id, user_hash } = await c.req.json()

    const existingProduct = await c.env.DB.prepare(`
      SELECT products.*, users.user_hash
      FROM products
      JOIN users ON products.creator_id = users.id
      WHERE products.id = ?
    `).bind(id).first()

    if (!existingProduct) {
      return c.json({ success: false, message: 'プロダクトが見つかりません' }, 404)
    }

    if (existingProduct.user_hash !== user_hash) {
      return c.json({ success: false, message: '自分の投稿のみ削除できます' }, 403)
    }

    await c.env.DB.prepare(`
      DELETE FROM products WHERE id = ?
    `).bind(id).run()

    return c.json({ success: true, message: 'プロダクトを削除しました' })
  } catch (err) {
    console.error('Error deleting product:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ success: false, message: 'プロダクトの削除に失敗しました: ' + errorMessage }, 500)
  }
})

export { wakuwaku }
