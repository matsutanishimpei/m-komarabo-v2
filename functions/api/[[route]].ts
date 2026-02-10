import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import auth from './auth';
import issues from './issues';
import wakuwaku from './wakuwaku';
import admin from './admin';

const app = new Hono().basePath('/api');

// ルーティングの統合
app.route('/auth', auth);         // /api/auth/login など
app.route('/issues', issues);     // /api/issues/list など
app.route('/wakuwaku', wakuwaku); // /api/wakuwaku/post-product など
app.route('/admin', admin);       // /api/admin/stats など

export const onRequest = handle(app);