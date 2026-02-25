import { Hono } from 'hono';
import { Bindings, Variables } from './types';

const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ========================================
// ※ adminGuard ミドルウェアにより、
//    すべてのルートは role === 'admin' が保証されています
// ========================================

// ========================================
// 管理者チェック API (フロントエンド用)
// ========================================

admin.get('/check', async (c) => {
    // ミドルウェアを通過 = admin確定
    const user = c.get('user');
    return c.json({ is_admin: true, user_id: user.id });
});

// ========================================
// 統計情報 API
// ========================================

admin.get('/stats', async (c) => {
    try {
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

admin.get('/users', async (c) => {
    try {
        const { results } = await c.env.DB.prepare(
            'SELECT id, display_name, email, role, avatar_url, is_profile_completed, COALESCE(is_active, 1) as is_active, created_at FROM users ORDER BY created_at DESC'
        ).all();

        return c.json({ users: results });
    } catch (err) {
        console.error('[admin/users] ユーザー一覧取得エラー:', err);
        return c.json({ error: 'ユーザー一覧の取得に失敗しました' }, 500);
    }
});

// ========================================
// ユーザーロールの切り替え API
// ========================================

admin.post('/users/toggle-role', async (c) => {
    try {
        const currentUser = c.get('user');
        const { target_user_id } = await c.req.json();

        // 自分自身の権限は変更不可
        if (currentUser.id === target_user_id) {
            return c.json({ success: false, message: '自分自身のロールは変更できません' }, 400);
        }

        // 現在の状態を取得して反転
        const target = await c.env.DB.prepare(
            'SELECT role FROM users WHERE id = ?'
        ).bind(target_user_id).first<{ role: string }>();

        if (!target) {
            return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404);
        }

        const newRole = target.role === 'admin' ? 'user' : 'admin';
        await c.env.DB.prepare(
            'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(newRole, target_user_id).run();

        return c.json({
            success: true,
            role: newRole,
            message: newRole === 'admin' ? '管理者権限を付与しました' : '管理者権限を解除しました'
        });
    } catch (err) {
        console.error('[admin/users/toggle-role] 権限変更エラー:', err);
        return c.json({ success: false, message: '権限の変更に失敗しました' }, 500);
    }
});

// ========================================
// ユーザー有効/無効の切り替え API
// ========================================

admin.post('/users/toggle-active', async (c) => {
    try {
        const currentUser = c.get('user');
        const { target_user_id } = await c.req.json();

        // 自分自身は変更不可
        if (currentUser.id === target_user_id) {
            return c.json({ success: false, message: '自分自身のステータスは変更できません' }, 400);
        }

        // 現在の状態を取得して反転
        const target = await c.env.DB.prepare(
            'SELECT is_active FROM users WHERE id = ?'
        ).bind(target_user_id).first<{ is_active: number }>();

        if (!target) {
            return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404);
        }

        const newActive = target.is_active ? 0 : 1;
        await c.env.DB.prepare(
            'UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(newActive, target_user_id).run();

        return c.json({
            success: true,
            is_active: newActive,
            message: newActive ? 'ユーザーを有効化しました' : 'ユーザーを無効化しました'
        });
    } catch (err) {
        console.error('[admin/users/toggle-active] ステータス変更エラー:', err);
        return c.json({ success: false, message: 'ステータスの変更に失敗しました' }, 500);
    }
});

// ========================================
// 最近の投稿 API
// ========================================

admin.get('/recent-activity', async (c) => {
    try {
        const issuesResult = await c.env.DB.prepare(`
            SELECT issues.title, issues.created_at, users.display_name as user_name, 'コマラボ' as type
            FROM issues
            JOIN users ON issues.requester_id = users.id
            ORDER BY issues.created_at DESC
            LIMIT 5
        `).all();

        const productsResult = await c.env.DB.prepare(`
            SELECT products.title, products.created_at, users.display_name as user_name, 'ワクワク' as type
            FROM products
            JOIN users ON products.creator_id = users.id
            ORDER BY products.created_at DESC
            LIMIT 5
        `).all();

        // @ts-ignore — results type from D1 is loosely typed
        const activities = [...(issuesResult.results || []), ...(productsResult.results || [])]
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
        const { prompt } = await c.req.json();

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
// ベースプロンプト管理 API (Multiple)
// ========================================

admin.get('/base-prompts/list', async (c) => {
    try {
        const { results } = await c.env.DB.prepare('SELECT id, label, prompt FROM base_prompts ORDER BY id ASC').all();
        return c.json({ results });
    } catch (err) {
        console.error('[admin/base-prompts/list] 取得エラー:', err);
        return c.json({ error: '一覧の取得に失敗しました' }, 500);
    }
});

admin.post('/base-prompts/save', async (c) => {
    try {
        const { id, label, prompt } = await c.req.json();

        if (!label || !prompt) {
            return c.json({ success: false, message: 'ラベルとプロンプトは必須です' }, 400);
        }

        if (id) {
            await c.env.DB.prepare(
                'UPDATE base_prompts SET label = ?, prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(label, prompt, id).run();
        } else {
            await c.env.DB.prepare(
                'INSERT INTO base_prompts (label, prompt) VALUES (?, ?)'
            ).bind(label, prompt).run();
        }

        return c.json({ success: true, message: '保存しました' });
    } catch (err) {
        console.error('[admin/base-prompts/save] 保存エラー:', err);
        return c.json({ success: false, message: '保存に失敗しました' }, 500);
    }
});

admin.post('/base-prompts/delete', async (c) => {
    try {
        const { id } = await c.req.json();
        await c.env.DB.prepare('DELETE FROM base_prompts WHERE id = ?').bind(id).run();
        return c.json({ success: true, message: '削除しました' });
    } catch (err) {
        console.error('[admin/base-prompts/delete] 削除エラー:', err);
        return c.json({ error: '削除に失敗しました' }, 500);
    }
});

admin.post('/base-prompts/import', async (c) => {
    try {
        const prompts = await c.req.json() as any[];
        if (!Array.isArray(prompts)) {
            return c.json({ success: false, message: '配列形式のデータが必要です' }, 400);
        }
        const stmts = [c.env.DB.prepare('DELETE FROM base_prompts')];
        for (const p of prompts) {
            if (p.label && p.prompt) {
                stmts.push(c.env.DB.prepare('INSERT INTO base_prompts (label, prompt) VALUES (?, ?)').bind(p.label, p.prompt));
            }
        }
        await c.env.DB.batch(stmts);
        return c.json({ success: true, message: 'ベースプロンプトをインポートしました' });
    } catch (err) {
        console.error('[admin/base-prompts/import] インポートエラー:', err);
        return c.json({ success: false, message: 'インポートに失敗しました' }, 500);
    }
});

// ========================================
// 要件定義プロンプト更新 API (コマラボ)
// ========================================

admin.post('/update-requirement-prompt', async (c) => {
    try {
        const { prompt } = await c.req.json();

        // UPSERT: キーが存在しない場合は INSERT、存在する場合は UPDATE
        await c.env.DB.prepare(
            "INSERT INTO site_configs (key, value, updated_at) VALUES ('komarabo_requirement_prompt', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP"
        ).bind(prompt, prompt).run();

        return c.json({ success: true, message: '要件定義プロンプトを更新しました' });
    } catch (err) {
        console.error('[admin/update-requirement-prompt] 更新エラー:', err);
        return c.json({ success: false, message: '要件定義プロンプトの更新に失敗しました' }, 500);
    }
});

// ========================================
// 制約スロット管理 API
// ========================================

admin.get('/constraints/list', async (c) => {
    try {
        const { results } = await c.env.DB.prepare('SELECT id, category, content FROM slot_constraints ORDER BY id DESC').all();
        return c.json(results);
    } catch (err) {
        console.error('[admin/constraints/list] 取得エラー:', err);
        return c.json({ error: '制約一覧の取得に失敗しました' }, 500);
    }
});

admin.post('/constraints', async (c) => {
    try {
        const { category, content } = await c.req.json();

        await c.env.DB.prepare('INSERT INTO slot_constraints (category, content) VALUES (?, ?)').bind(category, content).run();
        return c.json({ success: true });
    } catch (err) {
        console.error('[admin/constraints] 追加エラー:', err);
        return c.json({ error: '制約の追加に失敗しました' }, 500);
    }
});

admin.post('/constraints/delete', async (c) => {
    try {
        const { id } = await c.req.json();
        await c.env.DB.prepare('DELETE FROM slot_constraints WHERE id = ?').bind(id).run();
        return c.json({ success: true });
    } catch (err) {
        console.error('[admin/constraints/delete] 削除エラー:', err);
        return c.json({ error: '制約の削除に失敗しました' }, 500);
    }
});

admin.post('/constraints/import', async (c) => {
    try {
        const constraints = await c.req.json() as any[];
        if (!Array.isArray(constraints)) {
            return c.json({ success: false, message: '配列形式のデータが必要です' }, 400);
        }
        const stmts = [c.env.DB.prepare('DELETE FROM slot_constraints')];
        for (const item of constraints) {
            if (item.category && item.content) {
                stmts.push(c.env.DB.prepare('INSERT INTO slot_constraints (category, content) VALUES (?, ?)').bind(item.category, item.content));
            }
        }
        await c.env.DB.batch(stmts);
        return c.json({ success: true, message: '制約スロットをインポートしました' });
    } catch (err) {
        console.error('[admin/constraints/import] インポートエラー:', err);
        return c.json({ success: false, message: 'インポートに失敗しました' }, 500);
    }
});

export default admin;
