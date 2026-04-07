import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import wakuwaku from '../wakuwaku';
import { createMockDB, TEST_USER } from './helpers';

describe('ワクワク試作室API (Waku-Waku Lab)', () => {
    const app = new Hono<{ Bindings: any; Variables: any }>();
    app.use('*', async (c, next) => {
        c.set('user', TEST_USER);
        await next();
    });
    app.route('/wakuwaku', wakuwaku);

    it('他人の作品を削除するのをブロックすること', async () => {
        const mockDB = createMockDB();
        vi.spyOn(mockDB, 'prepare').mockReturnValueOnce({
            bind: () => ({
                first: async () => ({ creator_id: 'someone-else' })
            })
        } as any);

        const res = await app.request('/wakuwaku/delete-product', {
            method: 'POST',
            body: JSON.stringify({ id: 1 }),
        }, {
            DB: mockDB,
        } as any);

        expect(res.status).toBe(403);
        const data = await res.json() as any;
        expect(data.message).toContain('自分の投稿のみ削除');
    });

    it('他人のドラフトを「封印（公開）」するのをブロックすること', async () => {
        const mockDB = createMockDB();
        vi.spyOn(mockDB, 'prepare').mockReturnValueOnce({
            bind: () => ({
                first: async () => ({ creator_id: 'someone-else' })
            })
        } as any);

        const res = await app.request('/wakuwaku/seal', {
            method: 'POST',
            body: JSON.stringify({ 
                id: 1, 
                title: 'New Product',
                protocol_log: 'test',
                dialogue_log: 'test'
            }),
        }, {
            DB: mockDB,
        } as any);

        expect(res.status).toBe(403);
        const data = await res.json() as any;
        expect(data.message).toContain('権限がありません');
    });
});
