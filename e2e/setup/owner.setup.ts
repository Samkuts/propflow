import { test as setup } from '@playwright/test';
import { loginAs, authStatePath } from '../fixtures/auth';

setup('authenticate as owner', async ({ page }) => {
  await loginAs(page, 'owner');
  await page.context().storageState({ path: authStatePath('owner') });
});