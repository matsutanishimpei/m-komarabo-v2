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

// パブリック（未ログインで閲覧可能）なルート
// ----------------------------------------
// Issuesのパブリック情報
app.get('/issues/list', (c) => issues.fetch(c.req.raw, c.env, c.executionCtx));
app.get('/issues/detail', (c) => issues.fetch(c.req.raw, c.env, c.executionCtx));
app.get('/issues/requirement-prompt', (c) => issues.fetch(c.req.raw, c.env, c.executionCtx));

// Wakuwakuのパブリック情報
app.get('/wakuwaku/version', (c) => wakuwaku.fetch(c.req.raw, c.env, c.executionCtx));
app.get('/wakuwaku/products', (c) => wakuwaku.fetch(c.req.raw, c.env, c.executionCtx));
app.get('/wakuwaku/product/:id', (c) => wakuwaku.fetch(c.req.raw, c.env, c.executionCtx));
app.get('/wakuwaku/base-prompt', (c) => wakuwaku.fetch(c.req.raw, c.env, c.executionCtx));
app.get('/wakuwaku/base-prompts', (c) => wakuwaku.fetch(c.req.raw, c.env, c.executionCtx));
app.get('/wakuwaku/constraints/random', (c) => wakuwaku.fetch(c.req.raw, c.env, c.executionCtx));


// ========================================
// 認証必須ルート（JWT ミドルウェア適用）
// ========================================
app.use('/issues/*', authMiddleware);
app.use('/wakuwaku/*', authMiddleware);

app.route('/issues', issues);
app.route('/wakuwaku', wakuwaku);

// ========================================
// 管理者ルート（JWT + admin ガード）
// ========================================
app.use('/admin/*', authMiddleware, adminGuard);
app.route('/admin', admin);

export const onRequest = handle(app);