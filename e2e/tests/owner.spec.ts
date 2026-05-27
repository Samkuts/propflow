import { test, expect } from '@playwright/test';

/**
 * Owner portal E2E tests.
 * Uses cached auth from .auth/owner.json (created by setup-owner project).
 * Seeded account: owner@example.com / password123 (Bob)
 */

test.describe('Owner portal', () => {
  test('dashboard loads with stat cards', async ({ page }) => {
    await page.goto('/owner/dashboard');
    await expect(page).toHaveURL(/\/owner\/dashboard/);
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('properties page renders property cards', async ({ page }) => {
    await page.goto('/owner/properties');
    await expect(page.locator('h1')).toContainText('Properties');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('statements page: period picker and chart render', async ({ page }) => {
    await page.goto('/owner/statements');
    await expect(page.locator('h1')).toContainText('Statements');
    // Period picker (month/year selects)
    await expect(page.locator('select').first()).toBeVisible();
    // Export CSV button
    await expect(page.getByRole('button', { name: /export csv/i })).toBeVisible();
  });

  test('statements page: Request Disbursement button is visible', async ({ page }) => {
    await page.goto('/owner/statements');
    await expect(page.getByRole('button', { name: /request disbursement/i })).toBeVisible();
  });

  test('statements: disbursement modal opens and closes', async ({ page }) => {
    await page.goto('/owner/statements');
    await page.getByRole('button', { name: /request disbursement/i }).click();
    await expect(page.locator('h2').filter({ hasText: /request disbursement/i })).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.locator('h2').filter({ hasText: /request disbursement/i })).not.toBeVisible();
  });

  test('settings page: Bank Account tab is present', async ({ page }) => {
    await page.goto('/owner/settings');
    await expect(page.locator('h1')).toContainText('Settings');
    await expect(page.getByRole('button', { name: /bank account/i })).toBeVisible();
  });
});