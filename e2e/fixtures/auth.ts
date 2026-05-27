import { Page } from '@playwright/test';
import path from 'path';

export const CREDENTIALS: Record<string, { email: string; password: string; portal: string }> = {
  manager: { email: 'manager@example.com', password: 'password123', portal: 'manager' },
  tenant:  { email: 'tenant@example.com',  password: 'password123', portal: 'tenant' },
  owner:   { email: 'owner@example.com',   password: 'password123', portal: 'owner' },
  vendor:  { email: 'vendor@example.com',  password: 'password123', portal: 'vendor' },
};

export async function loginAs(page: Page, role: 'manager' | 'tenant' | 'owner' | 'vendor') {
  const creds = CREDENTIALS[role];
  await page.goto(`/${creds.portal}/login`);
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`/${creds.portal}/**`, { timeout: 10_000 });
}

export function authStatePath(role: string) {
  return path.join(__dirname, '..', '.auth', `${role}.json`);
}