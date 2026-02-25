import { Hono } from 'hono';
import { Bindings, Variables } from './types';
import { getTokenFromCookie, verifyJwt } from './helpers';

const issues = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 要件定義プロンプトの取得（コマラボ用・is_active=1の1件）
issues.get('/requirement-prompt', async (c) => {
    try {
        const row = await c.env.DB.prepare(
            "SELECT id, label, prompt FROM base_prompts WHERE feature = 'komarabo' AND is_active = 1 LIMIT 1"
        ).first<{ id: number; label: string; prompt: string }>();

        return c.json({ prompt: row?.prompt || '', label: row?.label || '', id: row?.id || null });
    } catch (err) {
        console.error('[issues/requirement-prompt] 取得エラー:', err);
        return c.json({ prompt: '' });
    }
});

// 悩み事の一覧取得（フィルター対応）
issues.get('/list', async (c) => {
    try {
        const filter = c.req.query('filter') || 'all';

        let user: any = c.get('user'); // if authMiddleware was applied
        if (!user) {
            const token = getTokenFromCookie(c);
            if (token) {
                const payload = await verifyJwt(c.env.JWT_SECRET, token);
                if (payload) {
                    user = {
                        id: payload.id,
                        display_name: payload.display_name,
                        role: payload.role,
                        sub: payload.sub,
                    };
                }
            }
        }

        let query = `
            SELECT 
                issues.*, 
                requester.display_name as requester_name,
                developer.display_name as developer_name
            FROM issues 
            JOIN users as requester ON issues.requester_id = requester.id
            LEFT JOIN users as developer ON issues.developer_id = developer.id
        `;
        let params: any[] = [];

        if (filter === 'mine' && user) {
            query += ' WHERE issues.requester_id = ?';
            params.push(user.id);
        }

        query += ' ORDER BY issues.updated_at DESC';

        const { results, success, error } = await c.env.DB.prepare(query).bind(...params).all();
        if (!success) {
            console.error('[issues/list] D1 クエリエラー:', error);
            return c.json({ message: 'データベースエラーが発生しました' }, 500);
        }
        return c.json(results || []);
    } catch (err) {
        console.error('[issues/list] 一覧取得エラー:', err);
        return c.json({ message: '課題一覧の取得に失敗しました' }, 500);
    }
});

// ステータス更新（挙手・着手）API
issues.post('/update-status', async (c) => {
    try {
        const user = c.get('user');
        const { id, status } = await c.req.json();

        // ステータス値のバリデーション
        const allowedStatuses = ['open', 'progress', 'closed'];
        if (!allowedStatuses.includes(status)) {
            return c.json({ success: false, message: '無効なステータスです' }, 400);
        }

        const issue = await c.env.DB.prepare(
            'SELECT requester_id, developer_id, status FROM issues WHERE id = ?'
        ).bind(id).first<{ requester_id: string; developer_id: string | null; status: string }>();

        if (!issue) {
            return c.json({ success: false, message: '課題が見つかりません' }, 404);
        }

        if (status === 'progress') {
            // すでに着手済みの場合はエラー（横取り防止）
            if (issue.status !== 'open' || issue.developer_id !== null) {
                return c.json({ success: false, message: 'この課題は既に着手されています' }, 400);
            }
            await c.env.DB.prepare(
                'UPDATE issues SET status = ?, developer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(status, user.id, id).run();
        } else if (status === 'closed') {
            // 解決承認は相談者本人のみ
            if (issue.requester_id !== user.id) {
                return c.json({ success: false, message: '解決承認は相談者本人のみが行えます' }, 403);
            }
            await c.env.DB.prepare(
                'UPDATE issues SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(status, id).run();
        } else {
            // openなどその他のステータス
            await c.env.DB.prepare(
                'UPDATE issues SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(status, id).run();
        }

        return c.json({ success: true, message: `ステータスを ${status} に更新しました` });
    } catch (err) {
        console.error('[issues/update-status] ステータス更新エラー:', err);
        return c.json({ success: false, message: 'ステータスの更新に失敗しました' }, 500);
    }
});

// 担当者の解除 — 開発者（自己辞退）または相談者（強制解除）が実行可能
issues.post('/unassign', async (c) => {
    try {
        const user = c.get('user');
        const { id } = await c.req.json();

        const issue = await c.env.DB.prepare(
            'SELECT requester_id, developer_id, status FROM issues WHERE id = ?'
        ).bind(id).first<{ requester_id: string; developer_id: string | null; status: string }>();

        if (!issue) {
            return c.json({ success: false, message: '課題が見つかりません' }, 404);
        }
        if (!issue.developer_id) {
            return c.json({ success: false, message: '現在担当者がいません' }, 400);
        }

        const isDeveloper = issue.developer_id === user.id;
        const isRequester = issue.requester_id === user.id;

        if (!isDeveloper && !isRequester) {
            return c.json({ success: false, message: '担当者本人か相談者のみ解除できます' }, 403);
        }

        // 担当者を解除して open に戻す
        await c.env.DB.prepare(
            'UPDATE issues SET status = "open", developer_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(id).run();

        // 解除した旨を自動コメント（透明性のため）
        const autoMsg = isDeveloper
            ? `🔄 担当者が自ら挙手を下ろしました。この課題は再度オープンになりました。`
            : `🔄 相談者が担当者の割り当てを解除しました。この課題は再度オープンになりました。`;
        await c.env.DB.prepare(
            'INSERT INTO comments (issue_id, user_id, content) VALUES (?, ?, ?)'
        ).bind(id, user.id, autoMsg).run();

        return c.json({ success: true, message: isDeveloper ? '挙手を下ろしました' : '担当者の割り当てを解除しました' });
    } catch (err) {
        console.error('[issues/unassign] 解除エラー:', err);
        return c.json({ success: false, message: '解除に失敗しました' }, 500);
    }
});

// 悩み事の詳細取得API（コメント込み）
issues.get('/detail', async (c) => {
    try {
        const idQuery = c.req.query('id');

        if (!idQuery) return c.json({ message: 'IDが指定されていません' }, 400);

        const id = idQuery;

        // ログイン状態の手動解決 (Public API用)
        let user: any = c.get('user');
        if (!user) {
            const token = getTokenFromCookie(c);
            if (token) {
                const payload = await verifyJwt(c.env.JWT_SECRET, token);
                if (payload) {
                    user = {
                        id: payload.id,
                        display_name: payload.display_name,
                        role: payload.role,
                        sub: payload.sub,
                    };
                }
            }
        }

        // 1. 課題本体を取得
        const issue = await c.env.DB.prepare(`
            SELECT 
                issues.*, 
                requester.display_name as requester_name,
                requester.id as requester_user_id,
                developer.display_name as developer_name,
                developer.id as developer_user_id
            FROM issues 
            JOIN users as requester ON issues.requester_id = requester.id
            LEFT JOIN users as developer ON issues.developer_id = developer.id
            WHERE issues.id = ?
        `).bind(id).first();

        if (!issue) return c.json({ message: '課題が見つかりません' }, 404);

        // 2. コメント一覧を取得
        const { results: comments } = await c.env.DB.prepare(`
            SELECT comments.*, users.display_name as user_name, users.id as user_id
            FROM comments 
            JOIN users ON comments.user_id = users.id
            WHERE comments.issue_id = ?
            ORDER BY comments.created_at ASC
        `).bind(id).all();

        return c.json({ issue, comments: comments || [] });
    } catch (err) {
        console.error('[issues/detail] 詳細取得エラー:', err);
        return c.json({ message: '課題の詳細取得に失敗しました' }, 500);
    }
});

// コメント投稿API
issues.post('/comment', async (c) => {
    try {
        const user = c.get('user');
        const { issue_id, content } = await c.req.json();

        if (!content || !content.trim()) {
            return c.json({ success: false, message: 'コメント内容を入力してください' }, 400);
        }
        if (content.length > 2000) {
            return c.json({ success: false, message: 'コメントは2000文字以内で入力してください' }, 400);
        }

        await c.env.DB.batch([
            c.env.DB.prepare(
                'INSERT INTO comments (issue_id, user_id, content) VALUES (?, ?, ?)'
            ).bind(issue_id, user.id, content.trim()),
            // コメントがあった課題を「最終活動あり」として updated_at を更新
            c.env.DB.prepare(
                'UPDATE issues SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(issue_id),
        ]);

        return c.json({ success: true, message: 'コメントを投稿しました' });
    } catch (err) {
        console.error('[issues/comment] コメント投稿エラー:', err);
        return c.json({ success: false, message: 'コメントの投稿に失敗しました' }, 500);
    }
});

// 悩み事を削除するAPI（着手されていないもののみ）
issues.post('/delete', async (c) => {
    try {
        const user = c.get('user');
        const { id } = await c.req.json();

        // 1. 課題の存在確認と所有者チェック
        const issue = await c.env.DB.prepare(
            'SELECT requester_id, status, developer_id FROM issues WHERE id = ?'
        ).bind(id).first<{ requester_id: string; status: string; developer_id: string | null }>();

        if (!issue) {
            return c.json({ success: false, message: '課題が見つかりません' }, 404);
        }

        // 2. 投稿者本人かチェック
        if (issue.requester_id !== user.id) {
            return c.json({ success: false, message: '自分の投稿のみ削除できます' }, 403);
        }

        // 3. 着手されていないかチェック（status='open' かつ developer_id=NULL）
        if (issue.status !== 'open' || issue.developer_id !== null) {
            return c.json({ success: false, message: '着手済みの課題は削除できません' }, 400);
        }

        // 4. 削除実行（関連コメントも削除）
        await c.env.DB.prepare('DELETE FROM comments WHERE issue_id = ?').bind(id).run();
        await c.env.DB.prepare('DELETE FROM issues WHERE id = ?').bind(id).run();

        return c.json({ success: true, message: '課題を削除しました' });
    } catch (err) {
        console.error('[issues/delete] 削除エラー:', err);
        return c.json({ success: false, message: '課題の削除に失敗しました' }, 500);
    }
});

// 要件定義（Geminiログ）を更新するAPI
issues.post('/update-requirement', async (c) => {
    try {
        const user = c.get('user');
        const { id, requirement_log } = await c.req.json();

        if (requirement_log && requirement_log.length > 50000) {
            return c.json({ success: false, message: '要件定義ログは50000文字以内にしてください' }, 400);
        }

        // 権限確認（相談者 または 担当開発者）
        const issue = await c.env.DB.prepare(
            'SELECT requester_id, developer_id FROM issues WHERE id = ?'
        ).bind(id).first<{ requester_id: string; developer_id: string | null }>();

        if (!issue) return c.json({ success: false, message: '課題が見つかりません' }, 404);

        const isAuthorized = (issue.requester_id === user.id) || (issue.developer_id === user.id);
        if (!isAuthorized) {
            return c.json({ success: false, message: '編集権限がありません' }, 403);
        }

        // 更新実行
        await c.env.DB.prepare(
            'UPDATE issues SET requirement_log = ? WHERE id = ?'
        ).bind(requirement_log, id).run();

        return c.json({ success: true, message: '要件定義ログを更新しました' });
    } catch (err) {
        console.error('[issues/update-requirement] 更新エラー:', err);
        return c.json({ success: false, message: '更新に失敗しました' }, 500);
    }
});

// 悩み事を投稿するAPI
issues.post('/post', async (c) => {
    try {
        const user = c.get('user');
        const { title, description } = await c.req.json();

        if (!title || !title.trim()) {
            return c.json({ success: false, message: 'タイトルを入力してください' }, 400);
        }
        if (title.length > 200) {
            return c.json({ success: false, message: 'タイトルは200文字以内で入力してください' }, 400);
        }
        if (!description || !description.trim()) {
            return c.json({ success: false, message: '説明を入力してください' }, 400);
        }
        if (description.length > 10000) {
            return c.json({ success: false, message: '説明は10000文字以内で入力してください' }, 400);
        }

        await c.env.DB.prepare(
            'INSERT INTO issues (requester_id, title, description) VALUES (?, ?, ?)'
        ).bind(user.id, title.trim(), description.trim()).run();

        return c.json({ success: true, message: '投稿完了しました！' });
    } catch (err) {
        console.error('[issues/post] 投稿エラー:', err);
        return c.json({ success: false, message: '投稿に失敗しました' }, 500);
    }
});

export default issues;
