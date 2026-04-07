import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import issues from '../issues';
import { createMockDB, TEST_USER } from './helpers';

describe('課題管理API (Komarabo)', () => {
    const app = new Hono<{ Bindings: any; Variables: any }>();
    app.use('*', async (c, next) => {
        c.set('user', TEST_USER);
        await next();
    });
    app.route('/issues', issues);

    it('他人の課題を「完了（closed）」に変更するのをブロックすること', async () => {
        // Mock DB: Issue owned by someone else
        const mockDB = createMockDB();
        vi.spyOn(mockDB, 'prepare').mockReturnValueOnce({
            bind: () => ({
                first: async () => ({ requester_id: 'someone-else', developer_id: 'dev-1', status: 'progress' })
            })
        } as any);

        const res = await app.request('/issues/update-status', {
            method: 'POST',
            body: JSON.stringify({ id: 1, status: 'closed' }),
        }, {
            DB: mockDB,
        } as any);

        expect(res.status).toBe(403);
        const data = await res.json() as any;
        expect(data.message).toContain('解決承認は相談者本人のみ');
    });

    it('担当者でも投稿者でもないユーザーが担当解除するのをブロックすること', async () => {
        // Mock DB: Issue belongs to others and developer is others
        const mockDB = createMockDB();
        vi.spyOn(mockDB, 'prepare').mockReturnValueOnce({
            bind: () => ({
                first: async () => ({ requester_id: 'someone-else', developer_id: 'someone-else-dev', status: 'progress' })
            })
        } as any);

        const res = await app.request('/issues/unassign', {
            method: 'POST',
            body: JSON.stringify({ id: 1 }),
        }, {
            DB: mockDB,
        } as any);

        expect(res.status).toBe(403);
        const data = await res.json() as any;
        expect(data.message).toContain('担当者本人か相談者のみ');
    });
});
