import { test as setup } from '@playwright/test';
import { loginAs, authStatePath } from '../fixtures/auth';

setup('authenticate as vendor', async ({ page }) => {
  await loginAs(page, 'vendor');
  await page.context().storageState({ path: authStatePath('vendor') });
});