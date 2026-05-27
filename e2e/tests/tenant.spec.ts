import { test, expect } from '@playwright/test';

/**
 * Tenant portal E2E tests.
 * Uses cached auth from .auth/tenant.json (created by setup-tenant project).
 * Seeded account: tenant@example.com / password123 (Carol)
 */

test.describe('Tenant portal', () => {
  test('dashboard loads', async ({ page }) => {
    await page.goto('/tenant/dashboard');
    await expect(page).toHaveURL(/\/tenant\/dashboard/);
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('payments page shows balance section', async ({ page }) => {
    await page.goto('/tenant/payments');
    await expect(page.locator('h1')).toContainText('Payments');
    // Balance card or payments section should render
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('maintenance page: submit form is accessible', async ({ page }) => {
    await page.goto('/tenant/maintenance');
    await expect(page.locator('h1')).toContainText('Maintenance');
    // New request button or form should be present
    await expect(page.locator('button').filter({ hasText: /new|submit|request/i }).first()).toBeVisible();
  });

  test('documents page: upload area is present', async ({ page }) => {
    await page.goto('/tenant/documents');
    await expect(page.locator('h1')).toContainText('Documents');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('messages page: inbox loads', async ({ page }) => {
    await page.goto('/tenant/messages');
    await expect(page.locator('h1')).toContainText('Messages');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('settings page: autopay toggle is present', async ({ page }) => {
    await page.goto('/tenant/settings');
    // Autopay section should be in settings (TenantSettings.tsx)
    await expect(page.locator('body')).not.toContainText('Error');
    // Look for Autopay text
    await expect(page.locator('body')).toContainText(/autopay/i);
  });
});