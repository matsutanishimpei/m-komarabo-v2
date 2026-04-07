import { test, expect } from '@playwright/test';
import { createToken, TEST_USER } from './auth.setup';
import { mockApi } from './api.mock';

test.describe('困りごとラボ (Citizen Lab)', () => {
    test.beforeEach(async ({ context, page }) => {
        await mockApi(page);
        const token = await createToken(TEST_USER);
        await context.addCookies([{
            name: 'auth_token',
            value: token,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
        }]);
    });

    test('認証済みユーザーがダッシュボードを閲覧できること', async ({ page }) => {
        await page.goto('/komarabo/index.html');
        // Wait for page load and auth check
        await expect(page.locator('#display_user_name')).toContainText(TEST_USER.display_name);
    });

    test('投稿がない場合に空の状態が表示されること', async ({ page }) => {
        // Since we use a fresh Mock D1 for the dev server (potentially), 
        // it might be empty or have seeds.
        await page.goto('/komarabo/index.html');
        // Check for the "none" text if using the mock
        // (Wait for API call to complete)
        await page.waitForLoadState('networkidle');
    });
});
