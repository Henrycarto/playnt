import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, logSample, openByText } from './helpers';

test.describe('complaint screen', () => {
  test('shows the seeded correction with its reason, the deadline and the audit trail', async ({ page }) => {
    await openByText(page, /potassium chloride/);
    await expect(page.locator('.dhead')).toContainText('Possible serious incident');
    await expect(page.locator('.dhead')).toContainText('Corrected');
    await expect(page.getByText('Due Friday 30 October 2026, 23:59 Vienna')).toBeVisible();
    await expect(page.locator('.decision .reason')).toContainText('The model treated this as a near miss');
    await expect(page.locator('.audit')).toContainText('Triage corrected');
    await expect(page.locator('mark')).toHaveText('A paediatric patient received an extra 8 mL of potassium chloride and needed cardiac monitoring overnight.');
    await expectNoAxeViolations(page);
  });

  test('shows a confirmed 10-day suggestion with its deadline and audit entry', async ({ page }) => {
    await openByText(page, /lot NB3-2610/);
    await expect(page.locator('.dhead')).toContainText('Confirmed');
    await expect(page.getByText('Due Monday 2 November 2026, 23:59 Vienna')).toBeVisible();
    await expect(page.locator('.audit')).toContainText('Triage confirmed');
    await expect(page.locator('mark')).toHaveText('Two users had the solution in their eyes and needed eye irrigation at A&E.');
  });

  test('explains regulatory terms on focus and closes the tooltip with Escape', async ({ page }) => {
    await openByText(page, /lot NB3-2610/);
    const term = page.getByRole('button', { name: '10-day limit' });
    await term.focus();
    const tip = page.getByRole('tooltip').filter({ hasText: 'MDR Article 87(5)' });
    await expect(tip).toBeVisible();
    await expect(term).toHaveAttribute('aria-describedby', (await tip.getAttribute('id'))!);
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await expect(page).toHaveURL(/\/complaints\//); // the first Escape only closes the tooltip
  });

  test('requires a reason before a correction is saved', async ({ page }) => {
    const fresh = await logSample(page, 0);
    await page.goto(`/complaints/${fresh.id}`);
    await expect(page.getByRole('button', { name: /Correct triage/ })).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.locator('#corr-h')).toBeVisible();
    await page.getByRole('button', { name: 'Save correction' }).click();
    const reason = page.getByLabel('Reason for correction');
    await expect(reason).toHaveAttribute('aria-invalid', 'true');
    await expect(reason).toBeFocused();
    await expect(page.getByText('Enter a reason of at least 10 characters.')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#corr-h')).toBeHidden();
  });

  test('confirms with C, updates in place and offers the next waiting complaint', async ({ page }) => {
    const fresh = await logSample(page, 2);
    await page.goto(`/complaints/${fresh.id}`);
    await expect(page.getByRole('button', { name: /Confirm triage/ })).toBeVisible();
    await page.keyboard.press('c');
    await expect(page.locator('.dhead')).toContainText('Confirmed');
    // A decision made under the frozen demo clock shares the suggestion's timestamp and must still show.
    await expect(page.locator('.decision')).toContainText('Confirmed by Quality engineer (demo)');
    await expect(page.locator('.audit li.fresh')).toContainText('Triage confirmed');
    await expect(page.locator('.notice')).toContainText(/Next waiting for a decision|No other complaint is waiting/);
  });

  test('shows manual triage when the model gave no usable answer, with a retry', async ({ page }) => {
    await openByText(page, /lot WD12-2610/);
    await expect(page.locator('.dhead')).toContainText('Needs manual triage');
    await expect(page.getByRole('button', { name: 'Ask the model again' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Triage by hand/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('answers an unknown complaint ID with a clear not-found page', async ({ page }) => {
    await page.goto('/complaints/0123456789abcdef01234567');
    await expect(page.getByRole('heading', { name: 'No such complaint' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the queue' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test('trends, audit trail, intake and sources are axe-clean', async ({ page }) => {
  for (const path of ['/trends', '/audit', '/new', '/sources']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoAxeViolations(page);
  }
});
