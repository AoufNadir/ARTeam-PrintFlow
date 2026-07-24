// Supabase-ready schema map — the 13 entities of the PrintFlow data model.
export interface EntityDef {
  table: string;
  label: string;
  fields: string[];
  relations?: { to: string; label: string }[];
}

export const ENTITIES: EntityDef[] = [
  { table: 'companies', label: 'الشركات', fields: ['id', 'name', 'activity', 'currency', 'default_unit'], relations: [{ to: 'users', label: '1-N' }] },
  { table: 'users', label: 'المستخدمون', fields: ['id', 'company_id', 'name', 'email', 'role'], relations: [{ to: 'companies', label: 'N-1' }] },
  { table: 'clients', label: 'العملاء', fields: ['id', 'company_id', 'name', 'phone', 'email'], relations: [{ to: 'devis', label: '1-N' }] },
  { table: 'projects', label: 'المشاريع', fields: ['id', 'client_id', 'name', 'status', 'due_date'], relations: [{ to: 'clients', label: 'N-1' }] },
  {
    table: 'devis',
    label: 'عروض الأسعار (Devis)',
    fields: ['number', 'client_id', 'price_version_id', 'totals', 'status'],
    relations: [
      { to: 'price_versions', label: 'تثبيت النسخة' },
      { to: 'devis_items', label: '1-N' },
      { to: 'pdf_files', label: '1-N' },
    ],
  },
  { table: 'devis_items', label: 'عناصر العروض', fields: ['id', 'devis_id', 'service_id', 'field_values', 'montage_result', 'pricing'], relations: [{ to: 'devis', label: 'N-1' }] },
  { table: 'sections', label: 'الأقسام', fields: ['id', 'name', 'sort_order', 'enabled'], relations: [{ to: 'services', label: '1-N' }] },
  { table: 'services', label: 'الخدمات', fields: ['id', 'section_id', 'name', 'stages', 'enabled'], relations: [{ to: 'fields', label: '1-N' }] },
  { table: 'fields', label: 'الحقول', fields: ['id', 'service_id', 'type', 'label', 'options_json'], relations: [{ to: 'pricing_rules', label: 'ربط' }] },
  { table: 'pricing_rules', label: 'قواعد التسعير', fields: ['id', 'name', 'basis', 'value', 'enabled'], relations: [{ to: 'price_versions', label: 'N-1' }] },
  { table: 'price_versions', label: 'إصدارات الأسعار', fields: ['id', 'version', 'rules_json', 'created_at'], relations: [{ to: 'devis', label: 'تجميد' }] },
  { table: 'pdf_files', label: 'ملفات PDF', fields: ['id', 'devis_id', 'kind', 'url', 'created_at'], relations: [{ to: 'devis', label: 'N-1' }] },
  { table: 'audit_log', label: 'سجل العمليات', fields: ['id', 'user_id', 'op', 'details', 'ref', 'created_at'], relations: [{ to: 'users', label: 'N-1' }] },
];

export function schemaJson(): string {
  return JSON.stringify(
    {
      name: 'arteam-printflow',
      target: 'supabase',
      generatedAt: new Date().toISOString(),
      tables: ENTITIES.map((e) => ({
        table: e.table,
        label: e.label,
        columns: e.fields,
        relations: e.relations ?? [],
      })),
    },
    null,
    2,
  );
}
