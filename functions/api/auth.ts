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
        'SELECT user_hash, password_hash, is_admin FROM users WHERE user_hash = ?'
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
            console.error('[auth/login] 新規登録エラー:', e);
            return c.json({ success: false, message: '登録に失敗しました' }, 500);
        }
    }

    // 既存ユーザーの認証（ハッシュ化パスワードのみ比較）
    if (existingUser.password_hash === password_hash) {
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
    console.error('[auth] 未処理エラー:', err);
    return c.json({ success: false, message: 'サーバーエラーが発生しました' }, 500);
});

export default auth;
