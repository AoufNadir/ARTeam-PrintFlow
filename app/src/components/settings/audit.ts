// Audit log — lightweight localStorage-backed journal of user operations.
// New entries prepend; Settings renders the latest 20. A window event
// ('printflow-audit') is dispatched so open views refresh live.

export type AuditOp = 'rule' | 'devis' | 'pdf' | 'status' | 'margin' | 'catalog' | 'project' | 'user';

export interface AuditEntry {
  id: string;
  at: string; // ISO
  user: string;
  op: AuditOp;
  opLabel: string;
  details: string;
  ref?: string;
}

const KEY = 'arteam-printflow:audit-log';
const SESSION_KEY = 'arteam-printflow:session';
export const AUDIT_EVENT = 'printflow-audit';

/** Name of the signed-in user from the session stored by Login (fallback if absent). */
export function currentUserName(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: unknown };
      if (typeof parsed.name === 'string' && parsed.name.trim()) return parsed.name.trim();
    }
  } catch {
    /* ignore */
  }
  return 'مستخدم غير مسجل';
}

export const AUDIT_OP_LABELS: Record<AuditOp, string> = {
  rule: 'تعديل قاعدة',
  devis: 'إنشاء Devis',
  pdf: 'تصدير PDF',
  status: 'تغيير حالة',
  margin: 'تعديل هامش',
  catalog: 'تعديل الكتالوج',
  project: 'نقل مشروع',
  user: 'إدارة مستخدمين',
};

function seedEntries(): AuditEntry[] {
  const now = Date.now();
  const mk = (minsAgo: number, op: AuditOp, details: string, ref?: string, user = 'أمين بوزيد'): AuditEntry => ({
    id: `audit-${minsAgo}`,
    at: new Date(now - minsAgo * 60_000).toISOString(),
    user,
    op,
    opLabel: AUDIT_OP_LABELS[op],
    details,
    ref,
  });
  return [
    mk(36, 'rule', 'سعر Couché 350g: 36→40 دج — أنشأ v13', 'قاعدة: سعر الورق'),
    mk(95, 'devis', 'أنشأ العرض D-2025-0147 لعميل مطعم الزيتونة', 'D-2025-0147', 'سارة مرابط'),
    mk(180, 'pdf', 'صدّر PDF تقني للمونتاج — ورقة 32×45', 'D-2025-0146', 'كمال حداد'),
    mk(300, 'status', 'غيّر حالة العرض إلى «مقبول»', 'D-2025-0143', 'سارة مرابط'),
    mk(480, 'margin', 'هامش الربح الافتراضي: 22→25% — أنشأ v12', 'قاعدة: هامش الربح'),
    mk(1500, 'catalog', 'أضاف خدمة «Étiquettes» إلى قسم أوفست', 'خدمة: Étiquettes'),
    mk(2900, 'project', 'انتقل مشروع «حملة Atlas Pub» إلى قيد الإنتاج', 'مشروع: Atlas Pub'),
  ];
}

export function listAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedEntries();
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

export function logAudit(op: AuditOp, details: string, ref?: string, user: string = currentUserName()): void {
  const entry: AuditEntry = {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    user,
    op,
    opLabel: AUDIT_OP_LABELS[op],
    details,
    ref,
  };
  const rows = [entry, ...listAudit()].slice(0, 100);
  localStorage.setItem(KEY, JSON.stringify(rows));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUDIT_EVENT));
}

/** "اليوم 10:24" / "أمس 18:02" / "14 جانفي" */
export function formatAuditTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `اليوم ${time}`;
  if (yesterday) return `أمس ${time}`;
  return `${d.getDate()}/${d.getMonth() + 1} ${time}`;
}
