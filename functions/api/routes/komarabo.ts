import { Hono } from 'hono'
import type { Env } from '../types'

const komarabo = new Hono<Env>()

// 悩み事の一覧取得（フィルター対応） -> /api/list-issues?filter=all|mine&user_hash=...
komarabo.get('/list-issues', async (c) => {
  const filter = c.req.query('filter') || 'all'
  const user_hash = c.req.query('user_hash')

  let query = `
    SELECT 
      issues.*, 
      requester.user_hash as user_hash,
      developer.user_hash as developer_user_hash
    FROM issues 
    JOIN users as requester ON issues.requester_id = requester.id
    LEFT JOIN users as developer ON issues.developer_id = developer.id
  `
  let params: any[] = []

  if (filter === 'mine' && user_hash) {
    query += ' WHERE requester.user_hash = ?'
    params.push(user_hash)
  }

  query += ' ORDER BY created_at DESC'

  const { results, success, error } = await c.env.DB.prepare(query).bind(...params).all()
  if (!success) {
    console.error("D1 Error:", error)
    return c.json({ message: "データベースエラーが発生しました。マイグレーションが適用されているか確認してください。", error }, 500)
  }
  return c.json(results || [])
})

// ステータス更新（挙手・着手）API
komarabo.post('/update-issue-status', async (c) => {
  const { id, status, user_hash } = await c.req.json()

  if (status === 'progress' && user_hash) {
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE user_hash = ?').bind(user_hash).first()
    if (user) {
      await c.env.DB.prepare(
        'UPDATE issues SET status = ?, developer_id = ? WHERE id = ?'
      ).bind(status, user.id, id).run()
    }
  } else {
    await c.env.DB.prepare(
      'UPDATE issues SET status = ? WHERE id = ?'
    ).bind(status, id).run()
  }

  return c.json({ success: true, message: `ステータスを ${status} に更新しました` })
})

// 挙手を下ろす（キャンセル）API
komarabo.post('/unassign-issue', async (c) => {
  const { id } = await c.req.json()

  await c.env.DB.prepare(
    'UPDATE issues SET status = "open", developer_id = NULL WHERE id = ?'
  ).bind(id).run()

  return c.json({ success: true, message: '挙手を下ろしました' })
})

// 悩み事の詳細取得API（コメント込み）
komarabo.get('/get-issue-detail', async (c) => {
  const id = c.req.query('id')
  if (!id) return c.json({ message: 'IDが指定されていません' }, 400)

  const issue = await c.env.DB.prepare(`
    SELECT 
      issues.*, 
      requester.user_hash as requester_user_hash,
      developer.user_hash as developer_user_hash
    FROM issues 
    JOIN users as requester ON issues.requester_id = requester.id
    LEFT JOIN users as developer ON issues.developer_id = developer.id
    WHERE issues.id = ?
  `).bind(id).first()

  if (!issue) return c.json({ message: '課題が見つかりません' }, 404)

  const { results: comments } = await c.env.DB.prepare(`
    SELECT comments.*, users.user_hash 
    FROM comments 
    JOIN users ON comments.user_id = users.id
    WHERE comments.issue_id = ?
    ORDER BY comments.created_at ASC
  `).bind(id).all()

  return c.json({ issue, comments: comments || [] })
})

// コメント投稿API
komarabo.post('/post-comment', async (c) => {
  const { issue_id, content, user_hash } = await c.req.json()

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE user_hash = ?').bind(user_hash).first()
  if (!user) return c.json({ message: 'ユーザーが見つかりません' }, 404)

  await c.env.DB.prepare(
    'INSERT INTO comments (issue_id, user_id, content) VALUES (?, ?, ?)'
  ).bind(issue_id, user.id, content).run()

  return c.json({ success: true, message: 'コメントを投稿しました' })
})

// 悩み事を削除するAPI（着手されていないもののみ）
komarabo.post('/delete-issue', async (c) => {
  const { id, user_hash } = await c.req.json()

  const issue = await c.env.DB.prepare(`
    SELECT issues.*, users.user_hash 
    FROM issues 
    JOIN users ON issues.requester_id = users.id
    WHERE issues.id = ?
  `).bind(id).first()

  if (!issue) {
    return c.json({ success: false, message: '課題が見つかりません' }, 404)
  }

  if (issue.user_hash !== user_hash) {
    return c.json({ success: false, message: '自分の投稿のみ削除できます' }, 403)
  }

  if (issue.status !== 'open' || issue.developer_id !== null) {
    return c.json({ success: false, message: '着手済みの課題は削除できません' }, 400)
  }

  await c.env.DB.prepare('DELETE FROM comments WHERE issue_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM issues WHERE id = ?').bind(id).run()

  return c.json({ success: true, message: '課題を削除しました' })
})

// 悩み事を投稿するAPI
komarabo.post('/post-issue', async (c) => {
  const { title, description, user_hash } = await c.req.json()

  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE user_hash = ?'
  ).bind(user_hash).first()

  if (!user) {
    return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404)
  }

  await c.env.DB.prepare(
    'INSERT INTO issues (requester_id, title, description) VALUES (?, ?, ?)'
  ).bind(user.id, title, description).run()

  return c.json({ success: true, message: '投稿完了しました！' })
})

export { komarabo }
