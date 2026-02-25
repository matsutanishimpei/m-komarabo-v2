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
// ベースプロンプト管理 API (feature別)
// ========================================

// 一覧取得（feature でフィルタ可能）
admin.get('/base-prompts/list', async (c) => {
    try {
        const feature = c.req.query('feature'); // 'wakuwaku' | 'komarabo' | undefined(全件)
        const query = feature
            ? 'SELECT id, label, prompt, feature, is_active FROM base_prompts WHERE feature = ? ORDER BY id ASC'
            : 'SELECT id, label, prompt, feature, is_active FROM base_prompts ORDER BY id ASC';
        const { results } = feature
            ? await c.env.DB.prepare(query).bind(feature).all()
            : await c.env.DB.prepare(query).all();
        return c.json({ results });
    } catch (err) {
        console.error('[admin/base-prompts/list] 取得エラー:', err);
        return c.json({ error: '一覧の取得に失敗しました' }, 500);
    }
});

// 保存（新規 / 更新）
admin.post('/base-prompts/save', async (c) => {
    try {
        const { id, label, prompt, feature = 'wakuwaku', is_active } = await c.req.json();

        if (!label || !label.trim()) return c.json({ success: false, message: 'ラベルは必須です' }, 400);
        if (!label.trim() || label.length > 100) return c.json({ success: false, message: 'ラベルは100文字以内で入力してください' }, 400);
        if (!prompt || !prompt.trim()) return c.json({ success: false, message: 'プロンプトは必須です' }, 400);
        if (prompt.length > 10000) return c.json({ success: false, message: 'プロンプトは10000文字以内で入力してください' }, 400);
        if (!['wakuwaku', 'komarabo'].includes(feature)) return c.json({ success: false, message: 'feature は wakuwaku または komarabo です' }, 400);

        const activeVal = is_active === undefined ? 1 : (is_active ? 1 : 0);

        if (id) {
            await c.env.DB.prepare(
                'UPDATE base_prompts SET label = ?, prompt = ?, feature = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(label.trim(), prompt.trim(), feature, activeVal, id).run();
        } else {
            await c.env.DB.prepare(
                'INSERT INTO base_prompts (label, prompt, feature, is_active) VALUES (?, ?, ?, ?)'
            ).bind(label.trim(), prompt.trim(), feature, activeVal).run();
        }

        return c.json({ success: true, message: '保存しました' });
    } catch (err) {
        console.error('[admin/base-prompts/save] 保存エラー:', err);
        return c.json({ success: false, message: '保存に失敗しました' }, 500);
    }
});

// 削除
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

// コマラボプロンプトの有効化（他のkomaraboプロンプトは自動で無効化）
admin.post('/base-prompts/activate-komarabo', async (c) => {
    try {
        const { id } = await c.req.json();
        if (!id) return c.json({ success: false, message: 'id は必須です' }, 400);
        const numId = parseInt(id, 10);
        if (isNaN(numId) || numId <= 0) return c.json({ success: false, message: 'id は正の整数です' }, 400);

        // 全コマラボプロンプトを無効化してから指定 ID のみ有効化（バッチでアトミック）
        // feature='komarabo' のレコードのみを対象にする
        await c.env.DB.batch([
            c.env.DB.prepare("UPDATE base_prompts SET is_active = 0 WHERE feature = 'komarabo'"),
            c.env.DB.prepare("UPDATE base_prompts SET is_active = 1 WHERE id = ? AND feature = 'komarabo'").bind(numId),
        ]);

        return c.json({ success: true, message: 'アクティブな要件定義プロンプトを切り替えました' });
    } catch (err) {
        console.error('[admin/base-prompts/activate-komarabo] 切り替えエラー:', err);
        return c.json({ success: false, message: '切り替えに失敗しました' }, 500);
    }
});

// インポート（feature 別）
admin.post('/base-prompts/import', async (c) => {
    try {
        const body = await c.req.json();
        const feature = c.req.query('feature') || 'wakuwaku';
        const prompts = Array.isArray(body) ? body : body.prompts;
        if (!Array.isArray(prompts)) {
            return c.json({ success: false, message: '配列形式のデータが必要です' }, 400);
        }
        const stmts: D1PreparedStatement[] = [
            c.env.DB.prepare('DELETE FROM base_prompts WHERE feature = ?').bind(feature)
        ];
        for (const p of prompts) {
            if (p.label && p.prompt) {
                const label = String(p.label).trim().slice(0, 100);   // 100文字上限
                const prompt = String(p.prompt).trim().slice(0, 10000); // 10000文字上限
                if (!label || !prompt) continue;
                stmts.push(c.env.DB.prepare(
                    'INSERT INTO base_prompts (label, prompt, feature, is_active) VALUES (?, ?, ?, ?)'
                ).bind(label, prompt, feature, p.is_active ?? 1));
            }
        }
        await c.env.DB.batch(stmts);
        return c.json({ success: true, message: 'インポートしました' });
    } catch (err) {
        console.error('[admin/base-prompts/import] インポートエラー:', err);
        return c.json({ success: false, message: 'インポートに失敗しました' }, 500);
    }
});

// 旧 update-requirement-prompt は恶化（base_prompts に統一）

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
