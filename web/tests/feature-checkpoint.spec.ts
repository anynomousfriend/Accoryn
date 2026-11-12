import { test, expect } from '@playwright/test';

// The app's first page must lead directly into a real, testable feature.
test('home opens the real device checkpoint and requires explicit speaker confirmation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Check your device' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Start microphone' })).toBeEnabled();
  await expect(page.getByText('0 of 3 checks confirmed')).toBeVisible();
  for (const name of ['camera', 'microphone']) {
    expect(await page.evaluate(async name => (await navigator.permissions.query({ name: name as PermissionName })).state, name)).toBe('prompt');
  }
  await page.getByRole('button', { name: 'Play test tone' }).click();
  await expect(page.getByRole('button', { name: 'I heard the tone' })).toBeVisible();
  await expect(page.getByText('0 of 3 checks confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'I heard the tone' }).click();
  await expect(page.getByText('1 of 3 checks confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'Reset checks' }).click();
  await expect(page.getByText('0 of 3 checks confirmed')).toBeVisible();
});
