import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, logSample } from './helpers';

test.describe('complaint queue', () => {
  test('lists complaints that need action with deadlines and flags, and is axe-clean', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Complaint queue' })).toBeVisible();
    await expect(page.locator('tbody tr:not(.skel)').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Needs action' })).toHaveAttribute('aria-pressed', 'true');
    // The flag is readable text with an icon, not colour alone.
    await expect(page.locator('tbody').getByText('Possible serious incident').first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('filters with chips and shows an empty state that says what to do', async ({ page }) => {
    await page.goto('/?status=decided&serious=true');
    await expect(page.locator('tbody tr:not(.skel)').first()).toBeVisible();
    await page.goto('/?status=needs_manual_triage&device=000000000000000000000000');
    await expect(page.getByText('No complaints match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('moves with J and K, opens with Enter and goes back with Escape', async ({ page }) => {
    await logSample(page, 1);
    await page.goto('/');
    const rows = page.locator('tbody tr:not(.skel)');
    await expect(rows.nth(1)).toBeVisible();
    await page.keyboard.press('j');
    await expect(rows.nth(0)).toBeFocused();
    await page.keyboard.press('j');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('k');
    await expect(rows.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/complaints\//);
    // The URL changes before the complaint screen mounts its key handler; wait for the screen itself.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^PLT-2026-\d{4}$/);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
  });

  test('confirms the focused suggestion in place with C and moves focus to the next waiting complaint', async ({ page }) => {
    const fresh = await logSample(page, 0);
    expect(fresh.status).toBe('suggested');
    await page.goto('/');
    const row = page.locator('tbody tr').filter({ hasText: fresh.ref });
    await expect(row).toContainText('Suggested');
    await row.focus();
    await page.keyboard.press('c');
    await expect(row).toContainText('Confirmed');
    await expect(page.locator('.statusline')).toContainText(`${fresh.ref} confirmed`);
    await expect(row).not.toBeFocused();
    await expect(page.locator('tbody tr:focus')).toHaveCount(1);
  });

  test('shows the keyboard shortcuts on ?', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Shift+?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
