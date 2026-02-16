import { Hono } from 'hono';
import { Bindings } from './types';

const auth = new Hono<{ Bindings: Bindings }>();

// パスワードをハッシュ化するユーティリティ
async function hashPassword(password: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

auth.post('/login', async (c) => {
    const { user_hash, password } = await c.req.json();
    const password_hash = await hashPassword(password);

    // ユーザーの存在確認
    const existingUser = await c.env.DB.prepare(
        'SELECT * FROM users WHERE user_hash = ?'
    ).bind(user_hash).first<{ user_hash: string, password_hash: string, is_admin: number }>();

    if (!existingUser) {
        /* 
         * 本来は登録とログインは分けるべきですが、
         * プロトタイプとして簡略化のため、存在しない場合は自動登録します。
         */
        try {
            await c.env.DB.prepare(
                'INSERT INTO users (user_hash, password_hash, is_admin) VALUES (?, ?, 0)'
            ).bind(user_hash, password_hash).run();

            return c.json({
                success: true,
                isNew: true,
                message: '新規登録・ログインしました',
                user_hash: user_hash,
                is_admin: 0,
                auth_token: 'dummy_token_' + Date.now()
            });
        } catch (e) {
            return c.json({ success: false, message: '登録に失敗しました: ' + (e instanceof Error ? e.message : String(e)) }, 500);
        }
    }

    // 既存ユーザーの認証
    // ハッシュ化パスワードの比較（単純文字列比較からハッシュ比較へ移行中）
    // 既存データがハッシュ化されていない場合の互換性は考慮しない（今回は全データリセット前提）
    if (existingUser.password_hash === password_hash || existingUser.password_hash === password) {
        return c.json({
            success: true,
            isNew: false,
            message: 'ログインしました',
            user_hash: existingUser.user_hash,
            is_admin: existingUser.is_admin,
            auth_token: 'dummy_token_' + Date.now()
        });
    } else {
        return c.json({ success: false, message: 'パスワードが違います' }, 401);
    }
});

auth.onError((err, c) => {
    console.error('Auth Error:', err);
    return c.json({ success: false, message: err.message || 'Internal Server Error' }, 500);
});

export default auth;
