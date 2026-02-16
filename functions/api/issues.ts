import { Hono } from 'hono';
import { Bindings } from './types';

const issues = new Hono<{ Bindings: Bindings }>();

// 悩み事の一覧取得（フィルター対応）
// 以前は /list-issues
issues.get('/list', async (c) => {
    try {
        const filter = c.req.query('filter') || 'all';
        const user_hash = c.req.query('user_hash');

        // developer_user_hash も取得できるように JOIN を追加
        let query = `
            SELECT 
                issues.*, 
                requester.user_hash as user_hash,
                developer.user_hash as developer_user_hash
            FROM issues 
            JOIN users as requester ON issues.requester_id = requester.id
            LEFT JOIN users as developer ON issues.developer_id = developer.id
        `;
        let params: any[] = [];

        if (filter === 'mine' && user_hash) {
            query += ' WHERE requester.user_hash = ?';
            params.push(user_hash);
        }

        query += ' ORDER BY created_at DESC';

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
// 以前は /update-issue-status
issues.post('/update-status', async (c) => {
    try {
        const { id, status, user_hash } = await c.req.json();

        // ステータス値のバリデーション
        const allowedStatuses = ['open', 'progress', 'closed'];
        if (!allowedStatuses.includes(status)) {
            return c.json({ success: false, message: '無効なステータスです' }, 400);
        }

        // 着手時は developer_id も更新
        if (status === 'progress' && user_hash) {
            const user = await c.env.DB.prepare('SELECT id FROM users WHERE user_hash = ?').bind(user_hash).first<{ id: number }>();
            if (user) {
                await c.env.DB.prepare(
                    'UPDATE issues SET status = ?, developer_id = ? WHERE id = ?'
                ).bind(status, user.id, id).run();
            }
        } else {
            await c.env.DB.prepare(
                'UPDATE issues SET status = ? WHERE id = ?'
            ).bind(status, id).run();
        }

        return c.json({ success: true, message: `ステータスを ${status} に更新しました` });
    } catch (err) {
        console.error('[issues/update-status] ステータス更新エラー:', err);
        return c.json({ success: false, message: 'ステータスの更新に失敗しました' }, 500);
    }
});

// 挙手を下ろす（キャンセル）API — 担当者本人のみ許可
// 以前は /unassign-issue
issues.post('/unassign', async (c) => {
    try {
        const { id, user_hash } = await c.req.json();

        if (!user_hash) {
            return c.json({ success: false, message: 'user_hash が必要です' }, 400);
        }

        // 担当者本人かチェック
        const user = await c.env.DB.prepare(
            'SELECT id FROM users WHERE user_hash = ?'
        ).bind(user_hash).first<{ id: number }>();

        if (!user) {
            return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404);
        }

        const issue = await c.env.DB.prepare(
            'SELECT developer_id FROM issues WHERE id = ?'
        ).bind(id).first<{ developer_id: number | null }>();

        if (!issue) {
            return c.json({ success: false, message: '課題が見つかりません' }, 404);
        }

        if (issue.developer_id !== user.id) {
            return c.json({ success: false, message: '担当者本人のみ挙手を下ろせます' }, 403);
        }

        await c.env.DB.prepare(
            'UPDATE issues SET status = "open", developer_id = NULL WHERE id = ?'
        ).bind(id).run();

        return c.json({ success: true, message: '挙手を下ろしました' });
    } catch (err) {
        console.error('[issues/unassign] 挙手キャンセルエラー:', err);
        return c.json({ success: false, message: '挙手の取り消しに失敗しました' }, 500);
    }
});

// 悩み事の詳細取得API（コメント込み）
// 以前は /get-issue-detail
issues.get('/detail', async (c) => {
    try {
        const idQuery = c.req.query('id');

        if (!idQuery) return c.json({ message: 'IDが指定されていません' }, 400);

        const id = idQuery;

        // 1. 課題本体を取得
        const issue = await c.env.DB.prepare(`
            SELECT 
                issues.*, 
                requester.user_hash as requester_user_hash,
                developer.user_hash as developer_user_hash
            FROM issues 
            JOIN users as requester ON issues.requester_id = requester.id
            LEFT JOIN users as developer ON issues.developer_id = developer.id
            WHERE issues.id = ?
        `).bind(id).first();

        if (!issue) return c.json({ message: '課題が見つかりません' }, 404);

        // 2. コメント一覧を取得
        const { results: comments } = await c.env.DB.prepare(`
            SELECT comments.*, users.user_hash 
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
// 以前は /post-comment
issues.post('/comment', async (c) => {
    try {
        const { issue_id, content, user_hash } = await c.req.json();

        if (!content || !content.trim()) {
            return c.json({ success: false, message: 'コメント内容を入力してください' }, 400);
        }

        const user = await c.env.DB.prepare('SELECT id FROM users WHERE user_hash = ?').bind(user_hash).first<{ id: number }>();
        if (!user) return c.json({ message: 'ユーザーが見つかりません' }, 404);

        await c.env.DB.prepare(
            'INSERT INTO comments (issue_id, user_id, content) VALUES (?, ?, ?)'
        ).bind(issue_id, user.id, content).run();

        return c.json({ success: true, message: 'コメントを投稿しました' });
    } catch (err) {
        console.error('[issues/comment] コメント投稿エラー:', err);
        return c.json({ success: false, message: 'コメントの投稿に失敗しました' }, 500);
    }
});

// 悩み事を削除するAPI（着手されていないもののみ）
// 以前は /delete-issue
issues.post('/delete', async (c) => {
    try {
        const { id, user_hash } = await c.req.json();

        // 1. 課題の存在確認と所有者チェック
        const issue = await c.env.DB.prepare(`
            SELECT issues.*, users.user_hash 
            FROM issues 
            JOIN users ON issues.requester_id = users.id
            WHERE issues.id = ?
        `).bind(id).first<{ user_hash: string, status: string, developer_id: any }>();

        if (!issue) {
            return c.json({ success: false, message: '課題が見つかりません' }, 404);
        }

        // 2. 投稿者本人かチェック
        if (issue.user_hash !== user_hash) {
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

// 悩み事を投稿するAPI
// 以前は /post-issue
issues.post('/post', async (c) => {
    try {
        const { title, description, user_hash } = await c.req.json();

        if (!title || !title.trim()) {
            return c.json({ success: false, message: 'タイトルを入力してください' }, 400);
        }
        if (!description || !description.trim()) {
            return c.json({ success: false, message: '説明を入力してください' }, 400);
        }

        const user = await c.env.DB.prepare(
            'SELECT id FROM users WHERE user_hash = ?'
        ).bind(user_hash).first<{ id: number }>();

        if (!user) {
            return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404);
        }

        await c.env.DB.prepare(
            'INSERT INTO issues (requester_id, title, description) VALUES (?, ?, ?)'
        ).bind(user.id, title, description).run();

        return c.json({ success: true, message: '投稿完了しました！' });
    } catch (err) {
        console.error('[issues/post] 投稿エラー:', err);
        return c.json({ success: false, message: '投稿に失敗しました' }, 500);
    }
});

export default issues;
