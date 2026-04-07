import { Page } from '@playwright/test';

export async function mockApi(page: Page) {
  // Mock Auth Me
  await page.route('**/api/auth/me', async (route) => {
    const cookies = route.request().headers()['cookie'] || '';
    if (cookies.includes('auth_token')) {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                authenticated: true,
                user: {
                    id: 'e2e-test-user-hash',
                    display_name: 'E2E Tester',
                    role: 'user',
                    sub: '123456789',
                    email: 'e2e@test.com'
                }
            }),
        });
    } else {
        await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ authenticated: false, code: 'AUTH_REQUIRED' }),
        });
    }
  });

  // Mock Profile Update
  await page.route('**/api/auth/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Mock Logout
  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Mock Komarabo Issues
  await page.route('**/api/issues/list*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
          {
              id: 1,
              title: 'Mock Issue 1',
              description: 'This is a mock issue for E2E testing',
              status: 'open',
              requester_id: 'e2e-test-user-hash',
              requester_name: 'E2E Tester',
              created_at: new Date().toISOString(),
          }
      ]),
    });
  });

  // Mock WakuWaku Products
  await page.route('**/api/wakuwaku/products', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
          {
              id: 101,
              title: 'Mock Product 1',
              creator_id: 'e2e-test-user-hash',
              creator_name: 'E2E Tester',
              status: 'published',
              sealed_at: new Date().toISOString(),
          }
      ]),
    });
  });

  // Mock Constraints
  await page.route('**/api/wakuwaku/constraints/random', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ category: 'Mock Category', content: 'Mock Content' }),
    });
  });
}
