import { Hono } from 'hono';
import { Bindings } from './types';
import { verifyAdmin } from './helpers';

const admin = new Hono<{ Bindings: Bindings }>();

// ========================================
// 管理者チェック API
// ========================================

admin.post('/check', async (c) => {
    try {
        const { user_hash } = await c.req.json();
        const isAdmin = await verifyAdmin(c, user_hash);
        return c.json({ is_admin: isAdmin });
    } catch (err) {
        console.error('[admin/check] チェックエラー:', err);
        return c.json({ is_admin: false }, 500);
    }
});

// ========================================
// 統計情報 API
// ========================================

admin.post('/stats', async (c) => {
    try {
        const { user_hash } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ error: 'Unauthorized' }, 403);

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
        console.error('[admin/stats] 統計取得エラー:', err);
        return c.json({ error: '統計情報の取得に失敗しました' }, 500);
    }
});

// ========================================
// ユーザー一覧 API
// ========================================

admin.post('/users', async (c) => {
    try {
        const { user_hash } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ error: 'Unauthorized' }, 403);

        const { results } = await c.env.DB.prepare(
            'SELECT user_hash, created_at, is_admin, COALESCE(is_active, 1) as is_active FROM users ORDER BY created_at DESC'
        ).all();

        return c.json({ users: results });
    } catch (err) {
        console.error('[admin/users] ユーザー一覧取得エラー:', err);
        return c.json({ error: 'ユーザー一覧の取得に失敗しました' }, 500);
    }
});

// ========================================
// ユーザー管理者権限の切り替え API
// ========================================

admin.post('/users/toggle-admin', async (c) => {
    try {
        const { user_hash, target_user_hash } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ success: false, message: 'Unauthorized' }, 403);

        // 自分自身の権限は変更不可
        if (user_hash === target_user_hash) {
            return c.json({ success: false, message: '自分自身の管理者権限は変更できません' }, 400);
        }

        // 現在の状態を取得して反転
        const target = await c.env.DB.prepare(
            'SELECT is_admin FROM users WHERE user_hash = ?'
        ).bind(target_user_hash).first<{ is_admin: number }>();

        if (!target) {
            return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404);
        }

        const newAdminStatus = target.is_admin ? 0 : 1;
        await c.env.DB.prepare(
            'UPDATE users SET is_admin = ? WHERE user_hash = ?'
        ).bind(newAdminStatus, target_user_hash).run();

        return c.json({ success: true, is_admin: newAdminStatus, message: newAdminStatus ? '管理者権限を付与しました' : '管理者権限を解除しました' });
    } catch (err) {
        console.error('[admin/users/toggle-admin] 権限変更エラー:', err);
        return c.json({ success: false, message: '権限の変更に失敗しました' }, 500);
    }
});

// ========================================
// ユーザー有効/無効の切り替え API (論理削除・復活)
// ========================================

admin.post('/users/toggle-active', async (c) => {
    try {
        const { user_hash, target_user_hash } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ success: false, message: 'Unauthorized' }, 403);

        // 自分自身は無効化不可
        if (user_hash === target_user_hash) {
            return c.json({ success: false, message: '自分自身を無効化することはできません' }, 400);
        }

        // 現在の状態を取得して反転
        const target = await c.env.DB.prepare(
            'SELECT COALESCE(is_active, 1) as is_active FROM users WHERE user_hash = ?'
        ).bind(target_user_hash).first<{ is_active: number }>();

        if (!target) {
            return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404);
        }

        const newActiveStatus = target.is_active ? 0 : 1;
        await c.env.DB.prepare(
            'UPDATE users SET is_active = ? WHERE user_hash = ?'
        ).bind(newActiveStatus, target_user_hash).run();

        return c.json({ success: true, is_active: newActiveStatus, message: newActiveStatus ? 'ユーザーを復活させました' : 'ユーザーを無効化しました' });
    } catch (err) {
        console.error('[admin/users/toggle-active] ステータス変更エラー:', err);
        return c.json({ success: false, message: 'ステータスの変更に失敗しました' }, 500);
    }
});

// ========================================
// 最近の投稿 API
// ========================================

admin.post('/recent-activity', async (c) => {
    try {
        const { user_hash } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ error: 'Unauthorized' }, 403);

        const issues = await c.env.DB.prepare(`
            SELECT issues.title, issues.created_at, users.user_hash, 'コマラボ' as type
            FROM issues
            JOIN users ON issues.requester_id = users.id
            ORDER BY issues.created_at DESC
            LIMIT 5
        `).all();

        const products = await c.env.DB.prepare(`
            SELECT products.title, products.created_at, users.user_hash, 'ワクワク' as type
            FROM products
            JOIN users ON products.creator_id = users.id
            ORDER BY products.created_at DESC
            LIMIT 5
        `).all();

        // @ts-ignore — results type from D1 is loosely typed
        const activities = [...(issues.results || []), ...(products.results || [])]
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 10);

        return c.json({ activities });
    } catch (err) {
        console.error('[admin/recent-activity] 取得エラー:', err);
        return c.json({ error: '最近のアクティビティの取得に失敗しました' }, 500);
    }
});

// ========================================
// ベースプロンプト更新 API
// ========================================

admin.post('/update-base-prompt', async (c) => {
    try {
        const { prompt, user_hash } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ success: false, message: '管理者権限が必要です' }, 403);

        await c.env.DB.prepare(
            "UPDATE site_configs SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'wakuwaku_base_prompt'"
        ).bind(prompt).run();

        return c.json({ success: true, message: 'ベースプロンプトを更新しました' });
    } catch (err) {
        console.error('[admin/update-base-prompt] 更新エラー:', err);
        return c.json({ success: false, message: 'ベースプロンプトの更新に失敗しました' }, 500);
    }
});

// ========================================
// 制約スロット管理 API
// ========================================

admin.post('/constraints/list', async (c) => {
    try {
        const { user_hash } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ error: 'Unauthorized' }, 403);

        const { results } = await c.env.DB.prepare('SELECT id, category, content FROM slot_constraints ORDER BY id DESC').all();
        return c.json(results);
    } catch (err) {
        console.error('[admin/constraints/list] 取得エラー:', err);
        return c.json({ error: '制約一覧の取得に失敗しました' }, 500);
    }
});

admin.post('/constraints', async (c) => {
    try {
        const { user_hash, category, content } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ error: 'Unauthorized' }, 403);

        await c.env.DB.prepare('INSERT INTO slot_constraints (category, content) VALUES (?, ?)').bind(category, content).run();
        return c.json({ success: true });
    } catch (err) {
        console.error('[admin/constraints] 追加エラー:', err);
        return c.json({ error: '制約の追加に失敗しました' }, 500);
    }
});

admin.post('/constraints/delete', async (c) => {
    try {
        const { user_hash, id } = await c.req.json();
        if (!(await verifyAdmin(c, user_hash))) return c.json({ error: 'Unauthorized' }, 403);

        await c.env.DB.prepare('DELETE FROM slot_constraints WHERE id = ?').bind(id).run();
        return c.json({ success: true });
    } catch (err) {
        console.error('[admin/constraints/delete] 削除エラー:', err);
        return c.json({ error: '制約の削除に失敗しました' }, 500);
    }
});

export default admin;
