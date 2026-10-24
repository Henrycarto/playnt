import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(summary).toEqual([]);
}

const API = 'http://127.0.0.1:4000/api';

// Logs a fresh complaint from a recorded sample, so tests that change state never depend on each other.
export async function logSample(page: Page, index = 0): Promise<{ id: string; ref: string; status: string }> {
  const samples = await (await page.request.get(`${API}/samples`)).json();
  const devices = await (await page.request.get(`${API}/devices`)).json();
  const s = samples[index];
  const deviceId = devices.find((d: { ref: string }) => d.ref === s.device).id;
  const res = await page.request.post(`${API}/complaints`, {
    data: { deviceId, text: s.text, reporterRole: s.reporterRole, reporterCountry: 'Austria', channel: s.channel, awarenessDate: '2026-10-24' },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

export async function openByText(page: Page, text: RegExp) {
  await page.goto('/?status=all');
  await page.locator('tbody tr').filter({ hasText: text }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^PLT-2026-\d{4}$/);
}
