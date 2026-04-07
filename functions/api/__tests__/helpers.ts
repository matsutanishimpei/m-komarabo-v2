import { vi } from 'vitest';
import * as jose from 'jose';

// ========================================
// D1 Database Mock
// ========================================

class MockD1PreparedStatement {
  constructor(private query: string, private params: any[] = []) {}

  bind(...params: any[]) {
    return new MockD1PreparedStatement(this.query, params);
  }

  async first<T = any>(colName?: string): Promise<T | null> {
    const results = await this.all();
    if (results.results.length === 0) return null;
    return colName ? (results.results[0] as any)[colName] : (results.results[0] as T);
  }

  async all<T = any>(): Promise<{ results: T[]; success: boolean; error?: string }> {
    // Basic mock behavior based on query strings
    if (this.query.includes('SELECT is_active FROM users')) {
      return { results: [{ is_active: 1 }] as any, success: true };
    }
    if (this.query.includes('SELECT requester_id, developer_id, status FROM issues')) {
        return { results: [{ requester_id: 'user-1', developer_id: 'dev-1', status: 'progress' }] as any, success: true };
    }
    return { results: [], success: true };
  }

  async run(): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }
}

export const createMockDB = () => ({
  prepare: (query: string) => new MockD1PreparedStatement(query),
  batch: vi.fn(async (statements: any[]) => {
    return statements.map(() => ({ success: true }));
  }),
  exec: vi.fn(async () => ({ success: true })),
});

// ========================================
// JWT Helpers
// ========================================

export async function createTestJwt(secret: string, payload: any) {
  const secretKey = new TextEncoder().encode(secret);
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1d')
    .sign(secretKey);
}

export const TEST_JWT_SECRET = 'test-secret';
export const TEST_USER = {
  id: 'user-1',
  display_name: 'Test User',
  role: 'user',
  sub: 'google-sub-1',
};
export const TEST_ADMIN = {
    id: 'admin-1',
    display_name: 'Admin User',
    role: 'admin',
    sub: 'google-sub-admin',
};
