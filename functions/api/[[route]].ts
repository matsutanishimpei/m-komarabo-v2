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
// 認証必須ルート（JWT ミドルウェア適用）
// ========================================
app.use('/issues/*', authMiddleware);
app.use('/wakuwaku/*', authMiddleware);

// 管理者ルート（JWT + admin ガード）
app.use('/admin/*', authMiddleware);
app.use('/admin/*', adminGuard);

app.route('/issues', issues);         // /api/issues/list など
app.route('/wakuwaku', wakuwaku);     // /api/wakuwaku/post-product など
app.route('/admin', admin);           // /api/admin/stats など

export const onRequest = handle(app);