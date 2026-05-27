import { test, expect } from '@playwright/test';

/**
 * Vendor portal E2E tests.
 * Uses cached auth from .auth/vendor.json (created by setup-vendor project).
 * Seeded account: vendor@example.com / password123 (Dave)
 */

test.describe('Vendor portal', () => {
  test('work orders page loads without error', async ({ page }) => {
    await page.goto('/vendor/work-orders');
    await expect(page).toHaveURL(/\/vendor\/work-orders/);
    await expect(page.locator('h1')).toContainText('Work Orders');
    await expect(page.locator('body')).not.toContainText('Error');
    await expect(page.locator('body')).not.toContainText('Unexpected error');
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/vendor/settings');
    await expect(page.locator('h1')).toContainText('Settings');
    await expect(page.locator('body')).not.toContainText('Error');
  });
});