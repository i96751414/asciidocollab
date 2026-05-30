import { test, expect } from '@playwright/test';

const protectedRoutes = [
  '/dashboard',
  '/dashboard/archived',
  '/dashboard/projects',
];

test.describe('Protected route coverage — SC-004', () => {
  for (const route of protectedRoutes) {
    test(`${route} without session redirects to /login`, async ({ page, context }) => {
      await context.clearCookies();
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
