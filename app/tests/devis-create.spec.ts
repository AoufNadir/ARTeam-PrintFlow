import { expect, test } from '@playwright/test';

test('devis creation page exposes the upgraded commercial editor', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('arteam-printflow:session', JSON.stringify({ name: 'Test User' }));
  });

  await page.goto('/devis/new', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /إنشاء Devis|تعديل العرض/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'البداية' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'التصميم' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'المونتاج' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'الإنتاج والسعر' })).toBeVisible();
  await expect(page.getByText('التسعير التجاري')).toBeVisible();
  await expect(page.getByRole('button', { name: 'إرسال للعميل' })).toBeDisabled();
});
