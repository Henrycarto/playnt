import { expect, test } from '@playwright/test';

// Demo mode must never reach a real service: every request from the browser stays on this machine.
test('no request leaves localhost in demo mode', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    const { hostname, protocol } = new URL(r.url());
    if (protocol === 'data:' || protocol === 'blob:') return;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) outside.push(r.url());
  });
  for (const path of ['/', '/?status=all', '/trends', '/audit', '/new', '/sources']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  await page.goto('/?status=all');
  await page.locator('tbody tr').filter({ hasText: 'NB3-2610' }).getByRole('link').click();
  await page.waitForLoadState('networkidle');
  expect(outside).toEqual([]);
});
