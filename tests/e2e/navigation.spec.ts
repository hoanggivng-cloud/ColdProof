import { expect, test } from '@playwright/test';
test('scaffold pages are accessible without sample data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ColdProof', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Source registry', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Chưa có dữ liệu.' })).toBeVisible();
  await page.getByRole('link', { name: 'Batches', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Batches', exact: true })).toBeVisible();
});
