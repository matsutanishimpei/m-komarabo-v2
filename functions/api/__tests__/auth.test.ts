import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, adminGuard } from '../helpers';
import { createMockDB, createTestJwt, TEST_JWT_SECRET, TEST_USER, TEST_ADMIN } from './helpers';

describe('認証ミドルウェアと権限ガード', () => {
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('/protected/*', authMiddleware);
  app.get('/protected/me', (c) => c.json({ user: c.get('user') }));
  app.get('/protected/admin', adminGuard, (c) => c.json({ ok: true }));

  it('トークンがない場合はリクエストをブロックすること', async () => {
    const res = await app.request('/protected/me');
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.code).toBe('AUTH_REQUIRED');
  });

  it('有効なトークンがある場合はリクエストを許可すること', async () => {
    const token = await createTestJwt(TEST_JWT_SECRET, TEST_USER);
    const res = await app.request('/protected/me', {
      headers: {
        Cookie: `auth_token=${token}`,
      },
    }, {
      DB: createMockDB(),
      JWT_SECRET: TEST_JWT_SECRET,
    } as any);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user.id).toBe(TEST_USER.id);
  });

  it('一般ユーザーが管理者用ルートへアクセスするのをブロックすること', async () => {
    const token = await createTestJwt(TEST_JWT_SECRET, TEST_USER);
    const res = await app.request('/protected/admin', {
      headers: {
        Cookie: `auth_token=${token}`,
      },
    }, {
      DB: createMockDB(),
      JWT_SECRET: TEST_JWT_SECRET,
    } as any);

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.code).toBe('ADMIN_REQUIRED');
  });

  it('管理者が管理者用ルートへアクセスできること', async () => {
    const token = await createTestJwt(TEST_JWT_SECRET, TEST_ADMIN);
    const res = await app.request('/protected/admin', {
      headers: {
        Cookie: `auth_token=${token}`,
      },
    }, {
      DB: createMockDB(),
      JWT_SECRET: TEST_JWT_SECRET,
    } as any);

    expect(res.status).toBe(200);
  });
});
