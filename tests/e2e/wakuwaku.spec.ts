import { test, expect } from '@playwright/test';
import { mockApi } from './api.mock';

test.describe('ワクワク試作室 (Prototyping Lab)', () => {
    test.beforeEach(async ({ page }) => {
        await mockApi(page);
        await page.goto('/wakuwaku/index.html');
    });

    test('作品ギャラリーが表示されること', async ({ page }) => {
        await expect(page.locator('span:text("ワクワク試作室")')).toBeVisible();
    });

    test('作品をクリックして詳細画面へ遷移できること', async () => {
        // This requires at least one product in the gallery.
        // We might want to check the "Archive" tab content if seeds exist.
    });
});
