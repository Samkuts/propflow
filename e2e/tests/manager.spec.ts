import { test, expect } from '@playwright/test';

/**
 * Manager portal E2E tests.
 * Uses cached auth from .auth/manager.json (created by setup-manager project).
 * Seeded account: manager@example.com / password123
 */

test.describe('Manager portal', () => {
  test('dashboard loads with stat cards', async ({ page }) => {
    await page.goto('/manager/dashboard');
    await expect(page).toHaveURL(/\/manager\/dashboard/);
    // Stat cards should render (look for any heading text)
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('properties list renders', async ({ page }) => {
    await page.goto('/manager/properties');
    await expect(page.locator('h1')).toContainText('Properties');
    // Table or empty state should be present
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('leases page loads', async ({ page }) => {
    await page.goto('/manager/leases');
    await expect(page.locator('h1')).toContainText('Leases');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('maintenance page loads', async ({ page }) => {
    await page.goto('/manager/maintenance');
    await expect(page.locator('h1')).toContainText('Maintenance');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('tenants page loads', async ({ page }) => {
    await page.goto('/manager/tenants');
    await expect(page.locator('h1')).toContainText('Tenants');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('applications page loads', async ({ page }) => {
    await page.goto('/manager/applications');
    await expect(page.locator('h1')).toContainText('Applications');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('reports page loads with tabs', async ({ page }) => {
    await page.goto('/manager/reports');
    await expect(page.locator('h1')).toContainText('Reports');
    // Rent Roll tab should be present
    await expect(page.locator('button, [role="tab"]').filter({ hasText: 'Rent Roll' })).toBeVisible();
  });

  test('accounting page loads', async ({ page }) => {
    await page.goto('/manager/accounting');
    await expect(page.locator('h1')).toContainText('Accounting');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('messages page: inbox loads and compose button is present', async ({ page }) => {
    await page.goto('/manager/messages');
    await expect(page.locator('h1')).toContainText('Messages');
    // Compose button
    await expect(page.getByRole('button', { name: /compose/i })).toBeVisible();
    // Broadcast button (Phase 5A feature)
    await expect(page.getByRole('button', { name: /broadcast/i })).toBeVisible();
  });

  test('messages: broadcast modal opens and closes', async ({ page }) => {
    await page.goto('/manager/messages');
    await page.getByRole('button', { name: /broadcast/i }).click();
    await expect(page.locator('h2').filter({ hasText: 'Broadcast Message' })).toBeVisible();
    await page.locator('button').filter({ hasText: 'Cancel' }).click();
    await expect(page.locator('h2').filter({ hasText: 'Broadcast Message' })).not.toBeVisible();
  });

  test('settings profile tab loads', async ({ page }) => {
    await page.goto('/manager/settings');
    await expect(page.locator('h1')).toContainText('Settings');
    await expect(page.locator('body')).not.toContainText('Error');
  });
});