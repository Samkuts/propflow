import { test as setup } from '@playwright/test';
import { loginAs, authStatePath } from '../fixtures/auth';

setup('authenticate as tenant', async ({ page }) => {
  await loginAs(page, 'tenant');
  await page.context().storageState({ path: authStatePath('tenant') });
});