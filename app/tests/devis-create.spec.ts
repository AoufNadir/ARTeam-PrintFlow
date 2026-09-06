import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('printflow-test-initialized')) {
      localStorage.clear();
      localStorage.setItem('arteam-printflow:session', JSON.stringify({ name: 'Test User' }));
      sessionStorage.setItem('printflow-test-initialized', '1');
    }
  });
  await page.goto('/devis/new', { waitUntil: 'domcontentloaded' });
});

test('starts with the client, then print type, then service', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /إنشاء Devis|تعديل العرض/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'معلومات العرض' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^1 العميل$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^2 نوع الطباعة$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^3 الخدمة$/ })).toBeVisible();

  await page.getByRole('button', { name: /اختر العميل/ }).click();
  await page.getByRole('button', { name: /يوسف بن عمر/ }).click();
  await page.getByRole('button', { name: /^التالي$/ }).click();
  await expect(page.getByRole('heading', { name: 'اختر نوع الطباعة' })).toBeVisible();

  await page.getByRole('button', { name: /طباعة رقمية/ }).first().click();
  await expect(page.getByRole('heading', { name: 'اختر الخدمة' })).toBeVisible();
  await expect(page.getByRole('button', { name: /مشروع مخصص/ })).toBeVisible();
});

test('custom project exposes four simple production steps', async ({ page }) => {
  await page.getByRole('button', { name: /اختر العميل/ }).click();
  await page.getByRole('button', { name: /يوسف بن عمر/ }).click();
  await page.getByRole('button', { name: /^التالي$/ }).click();
  await page.getByRole('button', { name: /طباعة رقمية/ }).first().click();
  await page.getByRole('button', { name: /مشروع مخصص/ }).click();
  await expect(page.getByRole('dialog', { name: 'ابدأ مشروعًا متعدد المراحل' })).toBeVisible();
  await page.getByRole('button', { name: /مشروع فارغ/ }).click();

  await expect(page.getByRole('button', { name: 'معلومات المشروع' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'مراحل الإنتاج' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'التسعير' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'مراجعة Devis' })).toBeVisible();
  await expect(page.getByText('Projet personnalisé')).toBeVisible();

  await page.getByLabel('اسم المشروع *').fill('مشروع بلوك نوت');
  await page.getByLabel('الكمية النهائية *').fill('100');
  await page.getByRole('button', { name: /^التالي/ }).click();
  await page.getByRole('button', { name: /إضافة مرحلة/ }).click();
  await page.getByRole('button', { name: 'قص', exact: true }).click();
  await page.getByPlaceholder('اسم المرحلة').fill('قص وتجهيز');
  await page.getByRole('button', { name: 'إضافة', exact: true }).click();
  await page.getByLabel('السعر').fill('10');
  await page.getByRole('button', { name: /^التالي/ }).click();

  await expect(page.getByRole('cell', { name: 'قص وتجهيز' })).toBeVisible();
  await expect(page.getByText('إجمالي تكلفة المراحل')).toBeVisible();
  await page.getByRole('button', { name: /^التالي/ }).click();
  await page.getByRole('button', { name: /إضافة المشروع إلى العرض/ }).click();
  await expect(page.getByText('تمت إضافة المشروع المخصص إلى العرض')).toBeVisible();
});

test('a custom print stage requires its own montage and becomes stale after quantity changes', async ({ page }) => {
  await page.getByRole('button', { name: /اختر العميل/ }).click();
  await page.getByRole('button', { name: /يوسف بن عمر/ }).click();
  await page.getByRole('button', { name: /^التالي$/ }).click();
  await page.getByRole('button', { name: /طباعة رقمية/ }).first().click();
  await page.getByRole('button', { name: /مشروع مخصص/ }).click();
  await page.getByRole('button', { name: /مشروع فارغ/ }).click();
  await page.getByLabel('اسم المشروع *').fill('مشروع طباعة متعدد المراحل');
  await page.getByLabel('الكمية النهائية *').fill('100');
  await page.getByRole('button', { name: /^التالي/ }).click();
  await page.getByRole('button', { name: /إضافة مرحلة/ }).click();
  await page.getByRole('button', { name: 'طباعة', exact: true }).click();
  await page.getByPlaceholder('اسم المرحلة').fill('طباعة الداخلي');
  await page.getByRole('button', { name: 'إضافة', exact: true }).click();

  await page.getByLabel('نوع الطباعة').selectOption('digital');
  await page.getByLabel('الماكينة').selectOption({ index: 1 });
  await page.locator('label').filter({ hasText: /^الورق/ }).locator('select').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'حساب المونتاج' }).click();
  await expect(page.getByText(/قطعة\/ورقة/)).toBeVisible();

  await page.getByLabel('الكمية', { exact: true }).fill('120');
  await expect(page.getByText('يحتاج إعادة حساب')).toBeVisible();
});

test('Projet personnalisé opens a selected builder template as editable production stages', async ({ page }) => {
  await page.evaluate(() => {
    const servicesKey = 'arteam-printflow:services';
    const sectionsKey = 'arteam-printflow:sections';
    const services = JSON.parse(localStorage.getItem(servicesKey) ?? '[]');
    const sections = JSON.parse(localStorage.getItem(sectionsKey) ?? '[]');
    services.push({
      id: 'svc-multistage-test', sectionId: 'sec-digital', name: 'كتاب تجريبي', latinName: 'Livre test', workflow: 'multiStage',
      fields: [], projectFieldIds: [], pricingRuleIds: [], montageMode: 'disabled', stages: ['impression', 'coupe'],
      stageTemplates: [
        { id: 'inside', order: 0, name: 'طباعة الداخلي', kind: 'print', printCategory: 'digital', montageMode: 'required', fieldIds: [] },
        { id: 'cut', order: 1, name: 'قص نهائي', kind: 'cut', montageMode: 'disabled', fieldIds: [] },
      ],
    });
    localStorage.setItem(servicesKey, JSON.stringify(services));
    localStorage.setItem(sectionsKey, JSON.stringify(sections.map((section: { id: string; serviceIds: string[] }) => section.id === 'sec-digital' ? { ...section, serviceIds: [...section.serviceIds, 'svc-multistage-test'] } : section)));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /اختر العميل/ }).click();
  await page.getByRole('button', { name: /يوسف بن عمر/ }).click();
  await page.getByRole('button', { name: /^التالي$/ }).click();
  await page.getByRole('button', { name: /طباعة رقمية/ }).first().click();
  await page.getByRole('button', { name: /مشروع مخصص/ }).click();
  await page.getByRole('button', { name: /كتاب تجريبي/ }).click();
  await expect(page.getByLabel('اسم المشروع *')).toHaveValue('كتاب تجريبي');
  await page.getByLabel('الكمية النهائية *').fill('100');
  await page.getByRole('button', { name: /^التالي/ }).click();
  await expect(page.getByText('طباعة الداخلي', { exact: true })).toBeVisible();
  await expect(page.getByText('قص نهائي', { exact: true })).toBeVisible();
});

test('legacy normal service keeps its flow without a montage step', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'arteam-printflow:services';
    const services = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      id: string;
      fields?: Array<Record<string, unknown>>;
    }>;
    localStorage.setItem(
      key,
      JSON.stringify(
        services.map((service) =>
          service.id === 'svc-carte-visite'
            ? {
                ...service,
                fields: (service.fields ?? []).map((field) =>
                  field.id === 'quantity'
                    ? { ...field, id: 'field-generated-qty', label: 'Quantité', latinName: 'Quantité', defaultValue: 100 }
                    : field,
                ),
              }
            : service,
        ),
      ),
    );
  });

  await page.getByRole('button', { name: /اختر العميل/ }).click();
  await page.getByRole('button', { name: /يوسف بن عمر/ }).click();
  await page.getByRole('button', { name: /^التالي$/ }).click();
  await page.getByRole('button', { name: /طباعة رقمية/ }).first().click();
  await page.getByRole('button', { name: /بطاقة زيارة/ }).click();

  await expect(page.getByRole('heading', { name: 'تفاصيل بطاقة زيارة' })).toBeVisible();
  await expect(page.getByText('الورق والطباعة والتشطيب')).toBeVisible();
  await expect(page.getByText(/مقاس التصميم/)).toHaveCount(0);
  await expect(page.getByText(/ملفات التصميم/)).toHaveCount(0);
  await expect(page.getByText(/85\s*[×x]\s*55/)).toHaveCount(0);
  await expect(page.getByLabel(/Quantité/)).toHaveValue('100');
  await page.getByLabel(/Quantité/).fill('250');
  await expect(page.getByLabel(/Quantité/)).toHaveValue('250');
  await expect(page.getByRole('button', { name: /التالي: مراجعة السعر/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /التالي: المونتاج/ })).toHaveCount(0);
});

test('explicit required montage blocks skipping for a digital service', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'arteam-printflow:services';
    const services = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string; montageMode?: string }>;
    localStorage.setItem(key, JSON.stringify(services.map((service) => service.id === 'svc-carte-visite' ? { ...service, montageMode: 'required' } : service)));
  });

  await page.getByRole('button', { name: /اختر العميل/ }).click();
  await page.getByRole('button', { name: /يوسف بن عمر/ }).click();
  await page.getByRole('button', { name: /^التالي$/ }).click();
  await page.getByRole('button', { name: /طباعة رقمية/ }).first().click();
  await page.getByRole('button', { name: /بطاقة زيارة/ }).click();
  await expect(page.getByRole('heading', { name: 'تفاصيل بطاقة زيارة' })).toBeVisible();
  await page.getByRole('button', { name: /التالي: المونتاج/ }).click();

  await expect(page.getByRole('heading', { name: 'المونتاج والحساب المتقدم' })).toBeVisible();
  await expect(page.getByText('مطلوب لهذه الخدمة')).toBeVisible();
  await expect(page.getByRole('button', { name: /تخطَّ/ })).toHaveCount(0);
});
