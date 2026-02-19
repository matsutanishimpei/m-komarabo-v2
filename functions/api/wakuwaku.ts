import { Hono } from 'hono';
import { Bindings } from './types';
import { getUserByHash, verifyAdmin } from './helpers';

const wakuwaku = new Hono<{ Bindings: Bindings }>();

// バージョン確認用
wakuwaku.get('/version', (c) => c.json({ version: '2026-02-16-v4-fixed' }));

// ベースプロンプト取得（管理画面から変更可能なあのプロンプト）
wakuwaku.get('/base-prompt', async (c) => {
    try {
        const config = await c.env.DB.prepare(
            'SELECT value FROM site_configs WHERE key = ?'
        ).bind('wakuwaku_base_prompt').first<{ value: string }>();

        return c.json({
            success: true,
            prompt: config?.value || 'プロンプトが設定されていません'
        });
    } catch (err) {
        console.error('[wakuwaku/base-prompt] 取得エラー:', err);
        return c.json({ success: false, message: 'プロンプトの取得に失敗しました' }, 500);
    }
});

// ベースプロンプト一覧取得（複数パターン対応）
wakuwaku.get('/base-prompts', async (c) => {
    try {
        const { results } = await c.env.DB.prepare(
            'SELECT id, label, prompt FROM base_prompts ORDER BY id ASC'
        ).all();

        return c.json({
            success: true,
            prompts: results || []
        });
    } catch (err) {
        console.error('[wakuwaku/base-prompts] 取得エラー:', err);
        return c.json({ success: false, message: 'プロンプト一覧の取得に失敗しました' }, 500);
    }
});

// ランダムな制約を取得 (Ideation)
wakuwaku.get('/constraints/random', async (c) => {
    try {
        const constraint = await c.env.DB.prepare('SELECT id, category, content FROM slot_constraints ORDER BY RANDOM() LIMIT 1').first();
        return c.json(constraint || { category: 'Default', content: '制約なし' });
    } catch (err) {
        console.error('[wakuwaku/constraints/random] 取得エラー:', err);
        return c.json({ category: 'Error', content: '制約取得エラー' });
    }
});

// ドラフト作成 (Development - Start)
wakuwaku.post('/drafts', async (c) => {
    try {
        const { title, user_hash } = await c.req.json();
        if (!title || !user_hash) return c.json({ success: false, message: 'タイトルとユーザーハッシュは必須です' }, 400);

        const user = await getUserByHash(c, user_hash);
        if (!user) return c.json({ success: false, message: 'ユーザーが見つかりません' }, 404);

        const res = await c.env.DB.prepare(
            "INSERT INTO products (creator_id, title, status) VALUES (?, ?, 'draft')"
        ).bind(user.id, title).run();

        return c.json({ success: true, id: res.meta.last_row_id });
    } catch (err) {
        console.error('[wakuwaku/drafts] 作成エラー:', err);
        return c.json({ success: false, message: 'ドラフトの作成に失敗しました' }, 500);
    }
});

// マイ・ドラフト一覧取得 (Development - Manage)
wakuwaku.get('/drafts', async (c) => {
    try {
        const user_hash = c.req.query('user_hash');
        if (!user_hash) return c.json([]);

        const { results } = await c.env.DB.prepare(`
            SELECT products.* 
            FROM products 
            JOIN users ON products.creator_id = users.id 
            WHERE users.user_hash = ? AND products.status = 'draft'
            ORDER BY products.created_at DESC
        `).bind(user_hash).all();
        return c.json(results || []);
    } catch (err) {
        console.error('[wakuwaku/drafts] 一覧取得エラー:', err);
        return c.json([], 500);
    }
});

// ドラフト保存 (Development - Save Draft)
wakuwaku.post('/drafts/save', async (c) => {
    try {
        const body = await c.req.json();
        const { id, user_hash, url, dev_obsession, protocol_log, dialogue_log, catch_copy } = body;

        const productId = Number(id);
        if (isNaN(productId)) {
            return c.json({ success: false, message: 'IDが無効です' }, 400);
        }

        // ユーザー確認
        const product = await c.env.DB.prepare(`
            SELECT products.*, users.user_hash 
            FROM products 
            JOIN users ON products.creator_id = users.id 
            WHERE products.id = ?
        `).bind(productId).first<{ user_hash: string }>();

        if (!product || product.user_hash !== user_hash) {
            return c.json({ success: false, message: '権限がありません' }, 403);
        }

        const params = [
            url ?? null,
            dev_obsession ?? null,
            protocol_log ?? null,
            dialogue_log ?? null,
            catch_copy ?? null,
            productId
        ];

        // 保存時に全フィールド更新
        await c.env.DB.prepare(`
            UPDATE products 
            SET url = ?, dev_obsession = ?, protocol_log = ?, dialogue_log = ?, catch_copy = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).bind(...params).run();

        return c.json({ success: true });
    } catch (err) {
        console.error('[wakuwaku/drafts/save] 保存エラー:', err);
        return c.json({ success: false, message: '保存に失敗しました' }, 500);
    }
});

// 封印 (Development - Seal)
wakuwaku.post('/seal', async (c) => {
    try {
        const { id, user_hash, protocol_log, dialogue_log, catch_copy } = await c.req.json();

        // 必須チェック
        if (!protocol_log || !dialogue_log) {
            return c.json({ success: false, message: '仕様書と対話ログは必須です' }, 400);
        }

        // ユーザー確認
        const product = await c.env.DB.prepare(`
            SELECT products.*, users.user_hash 
            FROM products 
            JOIN users ON products.creator_id = users.id 
            WHERE products.id = ?
        `).bind(id).first<{ user_hash: string }>();

        if (!product || product.user_hash !== user_hash) {
            return c.json({ success: false, message: '権限がありません' }, 403);
        }

        // 更新して公開
        await c.env.DB.prepare(`
            UPDATE products 
            SET protocol_log = ?, dialogue_log = ?, catch_copy = ?, status = 'published', sealed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).bind(protocol_log, dialogue_log, catch_copy || null, id).run();

        return c.json({ success: true, message: '封印完了' });
    } catch (err) {
        console.error('[wakuwaku/seal] 封印エラー:', err);
        return c.json({ success: false, message: '封印に失敗しました' }, 500);
    }
});


// プロダクト一覧取得API (Archive)
wakuwaku.get('/products', async (c) => {
    try {
        const { results } = await c.env.DB.prepare(`
            SELECT 
                products.*,
                users.user_hash as creator_user_hash
            FROM products
            JOIN users ON products.creator_id = users.id
            WHERE products.status = 'published'
            ORDER BY products.sealed_at DESC
        `).all();

        return c.json(results || []);
    } catch (err) {
        console.error('[wakuwaku/products] 一覧取得エラー:', err);
        return c.json([], 500);
    }
});

// プロダクト詳細取得API (Archive Detail)
wakuwaku.get('/product/:id', async (c) => {
    try {
        const id = c.req.param('id');

        const product = await c.env.DB.prepare(`
            SELECT 
                products.*,
                users.user_hash as creator_user_hash
            FROM products
            JOIN users ON products.creator_id = users.id
            WHERE products.id = ?
        `).bind(id).first();

        if (!product) {
            return c.json({ message: 'プロダクトが見つかりません' }, 404);
        }

        return c.json(product);
    } catch (err) {
        console.error('[wakuwaku/product/:id] 詳細取得エラー:', err);
        return c.json({ message: 'プロダクトの取得に失敗しました' }, 500);
    }
});

// プロダクト削除API (Keep for cleanup)
wakuwaku.post('/delete-product', async (c) => {
    try {
        const { id, user_hash } = await c.req.json();

        // プロダクト存在確認
        const existingProduct = await c.env.DB.prepare(`
            SELECT products.*, users.user_hash
            FROM products
            JOIN users ON products.creator_id = users.id
            WHERE products.id = ?
        `).bind(id).first<{ user_hash: string }>();

        if (!existingProduct) {
            return c.json({ success: false, message: 'プロダクトが見つかりません' }, 404);
        }

        // 投稿者本人確認
        if (existingProduct.user_hash !== user_hash) {
            return c.json({ success: false, message: '自分の投稿のみ削除できます' }, 403);
        }

        // 削除実行
        await c.env.DB.prepare(`
            DELETE FROM products WHERE id = ?
        `).bind(id).run();

        return c.json({ success: true, message: 'プロダクトを削除しました' });
    } catch (err) {
        console.error('[wakuwaku/delete-product] 削除エラー:', err);
        return c.json({ success: false, message: 'プロダクトの削除に失敗しました' }, 500);
    }
});

// 封印解除 (Admin Only - Unseal)
wakuwaku.post('/unseal', async (c) => {
    try {
        const { id, user_hash } = await c.req.json();

        // 実行者が管理者か確認
        const isAdmin = await verifyAdmin(c, user_hash);

        if (!isAdmin) {
            return c.json({ success: false, message: '権限がありません(Admin Only)' }, 403);
        }

        // ステータスをドラフトに戻す
        await c.env.DB.prepare(`
            UPDATE products 
            SET status = 'draft', sealed_at = NULL, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).bind(id).run();

        return c.json({ success: true, message: '下書きに戻しました' });
    } catch (err) {
        console.error('[wakuwaku/unseal] 封印解除エラー:', err);
        return c.json({ success: false, message: '封印解除に失敗しました' }, 500);
    }
});

export default wakuwaku;
