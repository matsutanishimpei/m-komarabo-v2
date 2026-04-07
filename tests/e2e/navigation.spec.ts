import { test, expect } from '@playwright/test';
import { mockApi } from './api.mock';

test.describe('全体ナビゲーション', () => {
    test.beforeEach(async ({ page }) => {
        await mockApi(page);
    });

    test('扉が2枚（困りごとラボ・ワクワク試作室）表示されること', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/試作室/);
        
        const komaraboLink = page.locator('a[href*="komarabo"]');
        const wakuwakuLink = page.locator('a[href*="wakuwaku"]');
        
        await expect(komaraboLink).toBeVisible();
        await expect(wakuwakuLink).toBeVisible();
    });

    test('未ログインでプロフィールを開くとログイン画面へリダイレクトされること', async ({ page }) => {
        await page.goto('/profile.html', { waitUntil: 'networkidle' });
        await page.waitForURL('**/login.html**', { timeout: 15000 });
        await expect(page.locator('#googleLoginBtn')).toBeVisible();
    });
});
