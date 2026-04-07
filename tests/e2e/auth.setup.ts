import * as jose from 'jose';

const JWT_SECRET = 'super-secret-test-key-12345';

export async function createToken(payload: any) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export const TEST_USER = {
  id: 'e2e-test-user-hash',
  display_name: 'E2E Tester',
  role: 'user',
  sub: '123456789',
};

export const TEST_ADMIN = {
  id: 'e2e-test-admin-hash',
  display_name: 'E2E Admin',
  role: 'admin',
  sub: '987654321',
};
