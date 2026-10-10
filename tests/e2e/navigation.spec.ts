import { expect, test } from '@playwright/test';
test('scaffold pages are accessible without sample data', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/.*\/login.*/);
  await page.fill('input[name="email"]', 'admin@gmail.com');
  await page.fill('input[name="password"]', '123456');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  
  await expect(page.getByRole('heading', { name: /Xin chào.*/ })).toBeVisible();
  await page.getByRole('link', { name: 'Nguồn dữ liệu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Source registry', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Lô hàng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lô hàng', exact: true })).toBeVisible();
});
