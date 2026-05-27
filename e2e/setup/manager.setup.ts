import { test as setup } from '@playwright/test';
import { loginAs, authStatePath } from '../fixtures/auth';

setup('authenticate as manager', async ({ page }) => {
  await loginAs(page, 'manager');
  await page.context().storageState({ path: authStatePath('manager') });
});