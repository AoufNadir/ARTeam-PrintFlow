import { expect, test } from '@playwright/test';

test('devis creation page exposes the upgraded commercial editor', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('arteam-printflow:session', JSON.stringify({ name: 'Test User' }));
  });

  await page.goto('/devis/new');

  await expect(page.getByRole('heading', { name: /إنشاء Devis|تعديل العرض/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'الخدمة والعميل' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'المواصفات والمونتاج' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'الشروط والمراجعة' })).toBeVisible();
  await expect(page.getByText('التسعير التجاري')).toBeVisible();
  await expect(page.getByRole('button', { name: 'إرسال للعميل' })).toBeDisabled();
});
