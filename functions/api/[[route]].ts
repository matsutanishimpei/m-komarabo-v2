import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { Bindings, Variables } from './types';
import { authMiddleware, adminGuard } from './helpers';
import auth from './auth';
import issues from './issues';
import wakuwaku from './wakuwaku';
import admin from './admin';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath('/api');

// ========================================
// 認証不要ルート（OAuth フロー自体）
// ========================================
app.route('/auth', auth);             // /api/auth/google, /api/auth/callback, /api/auth/me, /api/auth/logout

// ========================================
// 認証必須ルート（特定のPublicルートはスキップ）
// ========================================
const publicPaths = [
    '/api/issues/list',
    '/api/issues/detail',
    '/api/issues/requirement-prompt',
    '/api/wakuwaku/version',
    '/api/wakuwaku/products',
    '/api/wakuwaku/base-prompt',
    '/api/wakuwaku/base-prompts',
    '/api/wakuwaku/constraints/random'
];

app.use('/issues/*', async (c, next) => {
    if (publicPaths.includes(c.req.path)) {
        return next();
    }
    return authMiddleware(c, next);
});

app.use('/wakuwaku/*', async (c, next) => {
    if (publicPaths.includes(c.req.path) || c.req.path.startsWith('/api/wakuwaku/product/')) {
        return next();
    }
    return authMiddleware(c, next);
});

app.route('/issues', issues);
app.route('/wakuwaku', wakuwaku);

// ========================================
// 管理者ルート（JWT + admin ガード）
// ========================================
app.use('/admin/*', authMiddleware, adminGuard);
app.route('/admin', admin);

export const onRequest = handle(app);