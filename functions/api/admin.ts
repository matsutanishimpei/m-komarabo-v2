import { Hono } from 'hono';
import { Bindings } from './types';

const admin = new Hono<{ Bindings: Bindings }>();

// 管理者チェックAPI
// /admin/check
admin.post('/check', async (c) => {
    try {
        const { user_hash } = await c.req.json();

        const user = await c.env.DB.prepare(
            'SELECT is_admin FROM users WHERE user_hash = ?'
        ).bind(user_hash).first<{ is_admin: number }>();

        return c.json({
            is_admin: user?.is_admin === 1
        });
    } catch (err) {
        console.error('Error checking admin:', err);
        return c.json({ is_admin: false }, 500);
    }
});

// 統計情報API
// /admin/stats
admin.post('/stats', async (c) => {
    try {
        const { user_hash } = await c.req.json();

        // 管理者チェック
        const user = await c.env.DB.prepare(
            'SELECT is_admin FROM users WHERE user_hash = ?'
        ).bind(user_hash).first<{ is_admin: number }>();

        if (!user || user.is_admin !== 1) {
            return c.json({ error: 'Unauthorized' }, 403);
        }

        // 統計情報を取得
        const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
        const issueCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM issues').first<{ count: number }>();
        const productCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM products').first<{ count: number }>();
        const commentCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM comments').first<{ count: number }>();

        return c.json({
            users: userCount?.count || 0,
            issues: issueCount?.count || 0,
            products: productCount?.count || 0,
            comments: commentCount?.count || 0
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return c.json({ error: errorMessage }, 500);
    }
});

// ユーザー一覧API
// /admin/users
admin.post('/users', async (c) => {
    try {
        const { user_hash } = await c.req.json();

        // 管理者チェック
        const user = await c.env.DB.prepare(
            'SELECT is_admin FROM users WHERE user_hash = ?'
        ).bind(user_hash).first<{ is_admin: number }>();

        if (!user || user.is_admin !== 1) {
            return c.json({ error: 'Unauthorized' }, 403);
        }

        // ユーザー一覧を取得
        const { results } = await c.env.DB.prepare(`
      SELECT user_hash, created_at, is_admin
      FROM users
      ORDER BY created_at DESC
    `).all();

        return c.json({ users: results });
    } catch (err) {
        console.error('Error fetching users:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return c.json({ error: errorMessage }, 500);
    }
});

// 最近の投稿API
// /admin/recent-activity
admin.post('/recent-activity', async (c) => {
    try {
        const { user_hash } = await c.req.json();

        // 管理者チェック
        const user = await c.env.DB.prepare(
            'SELECT is_admin FROM users WHERE user_hash = ?'
        ).bind(user_hash).first<{ is_admin: number }>();

        if (!user || user.is_admin !== 1) {
            return c.json({ error: 'Unauthorized' }, 403);
        }

        // 最近の投稿を取得（issuesとproductsを結合）
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
    `).all();

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
    `).all();

        // 結合してソート
        // @ts-ignore
        const activities = [...(issues.results || []), ...(products.results || [])]
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 10);

        return c.json({ activities });
    } catch (err) {
        console.error('Error fetching recent activity:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return c.json({ error: errorMessage }, 500);
    }
});

// ベースプロンプト更新API（管理者用）
// /admin/update-base-prompt
admin.post('/update-base-prompt', async (c) => {
    try {
        const { prompt, user_hash } = await c.req.json();

        // 管理者チェック
        const user = await c.env.DB.prepare(
            'SELECT is_admin FROM users WHERE user_hash = ?'
        ).bind(user_hash).first<{ is_admin: number }>();

        if (!user || user.is_admin !== 1) {
            return c.json({ success: false, message: '管理者権限が必要です' }, 403);
        }

        await c.env.DB.prepare(`
      UPDATE site_configs 
      SET value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE key = 'wakuwaku_base_prompt'
    `).bind(prompt).run();

        return c.json({ success: true, message: 'ベースプロンプトを更新しました' });
    } catch (err) {
        console.error('Error updating base prompt:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return c.json({ success: false, message: errorMessage }, 500);
    }
});


// スロット制約一覧取得API
// /admin/constraints
admin.get('/constraints', async (c) => {
    try {
        const { results } = await c.env.DB.prepare('SELECT * FROM slot_constraints ORDER BY id DESC').all();
        return c.json(results);
    } catch (err) {
        return c.json({ error: 'Failed to fetch constraints' }, 500);
    }
});

// スロット制約追加API
// /admin/constraints
admin.post('/constraints', async (c) => {
    try {
        const { user_hash, category, content } = await c.req.json();

        // Check Admin
        const user = await c.env.DB.prepare('SELECT is_admin FROM users WHERE user_hash = ?').bind(user_hash).first<{ is_admin: number }>();
        if (!user || user.is_admin !== 1) return c.json({ error: 'Unauthorized' }, 403);

        await c.env.DB.prepare('INSERT INTO slot_constraints (category, content) VALUES (?, ?)').bind(category, content).run();
        return c.json({ success: true });
    } catch (err) {
        return c.json({ error: 'Failed to add constraint' }, 500);
    }
});

// スロット制約削除API
// /admin/constraints/delete
admin.post('/constraints/delete', async (c) => {
    try {
        const { user_hash, id } = await c.req.json();

        // Check Admin
        const user = await c.env.DB.prepare('SELECT is_admin FROM users WHERE user_hash = ?').bind(user_hash).first<{ is_admin: number }>();
        if (!user || user.is_admin !== 1) return c.json({ error: 'Unauthorized' }, 403);

        await c.env.DB.prepare('DELETE FROM slot_constraints WHERE id = ?').bind(id).run();
        return c.json({ success: true });
    } catch (err) {
        return c.json({ error: 'Failed to delete constraint' }, 500);
    }
});

export default admin;
