import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import SectionCard from '@/components/ds/SectionCard';
import { Btn, FieldLabel, inputCls, Modal } from './Overlay';
import { logAudit } from './audit';
import { avatarColor, initials } from '@/components/clients/crm-meta';
import { cn } from '@/lib/utils';

const ROLES = ['صاحب الشركة', 'موظف استقبال ومبيعات', 'مسؤول التسعير', 'مسؤول الإنتاج', 'مدير'] as const;

const CAPABILITIES = ['إنشاء Devis', 'تعديل قواعد الأسعار', 'إدارة الماكينات', 'تعديل هامش الربح يدويًا', 'إدارة المستخدمين', 'الوصول للمونتاج اليدوي'] as const;

// default grants: role × capability
const DEFAULT_MATRIX: Record<string, boolean[]> = {
  'صاحب الشركة': [true, true, true, true, true, true],
  'موظف استقبال ومبيعات': [true, false, false, false, false, false],
  'مسؤول التسعير': [true, true, false, true, false, false],
  'مسؤول الإنتاج': [false, false, true, false, false, true],
  'مدير': [true, true, true, true, true, true],
};

interface ShopUser {
  id: string;
  name: string;
  email: string;
  role: (typeof ROLES)[number];
  active: boolean;
  lastLogin: string;
}

const DEFAULT_USERS: ShopUser[] = [
  { id: 'u1', name: 'أمين بوزيد', email: 'amine@arteam.dz', role: 'صاحب الشركة', active: true, lastLogin: 'اليوم 09:12' },
  { id: 'u2', name: 'سارة مرابط', email: 'sara@arteam.dz', role: 'موظف استقبال ومبيعات', active: true, lastLogin: 'اليوم 08:40' },
  { id: 'u3', name: 'يوسف بن عمر', email: 'youcef@arteam.dz', role: 'مسؤول التسعير', active: true, lastLogin: 'أمس 17:22' },
  { id: 'u4', name: 'كمال حداد', email: 'kamel@arteam.dz', role: 'مسؤول الإنتاج', active: false, lastLogin: 'قبل 3 أيام' },
];

const USERS_KEY = 'arteam-printflow:settings-users';
const MATRIX_KEY = 'arteam-printflow:settings-matrix';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Section 5 — المستخدمون والأدوار (#users): users table + permissions matrix. */
export default function UsersSection() {
  const [users, setUsers] = useState<ShopUser[]>(() => loadJson(USERS_KEY, DEFAULT_USERS));
  const [matrix, setMatrix] = useState<Record<string, boolean[]>>(() => loadJson(MATRIX_KEY, DEFAULT_MATRIX));
  const [invite, setInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>('موظف استقبال ومبيعات');
  const [confirmRole, setConfirmRole] = useState<{ user: ShopUser; role: (typeof ROLES)[number] } | null>(null);

  const saveUsers = (next: ShopUser[]) => {
    setUsers(next);
    localStorage.setItem(USERS_KEY, JSON.stringify(next));
  };

  const toggleCell = (role: string, idx: number) => {
    if (role === 'صاحب الشركة') {
      toast.info('صلاحيات المالك كاملة');
      return;
    }
    const next = { ...matrix, [role]: matrix[role].map((v, i) => (i === idx ? !v : v)) };
    setMatrix(next);
    localStorage.setItem(MATRIX_KEY, JSON.stringify(next));
    logAudit('user', `عدّل صلاحية «${CAPABILITIES[idx]}» لدور ${role}`, 'مصفوفة الصلاحيات');
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="المستخدمون"
        actions={
          <Btn variant="secondary" size="sm" onClick={() => setInvite(true)}>
            <UserPlus size={14} /> دعوة مستخدم
          </Btn>
        }
      >
        <div className="overflow-hidden rounded-[12px] border border-[var(--line)]">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--paper-100)]">
              <tr>
                {['المستخدم', 'البريد', 'الدور', 'نشط', 'آخر دخول'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-start text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const { bg, fg } = avatarColor(u.name);
                return (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: u.active ? 1 : 0.55, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-t border-[var(--line)]"
                  >
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold" style={{ backgroundColor: bg, color: fg }}>
                          {initials(u.name)}
                        </span>
                        <span className="font-semibold text-[var(--ink-900)]">{u.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span dir="ltr" className="font-latin text-[12px] text-[var(--ink-500)]">
                        {u.email}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={u.role}
                        onChange={(e) => setConfirmRole({ user: u, role: e.target.value as (typeof ROLES)[number] })}
                        className="h-8 rounded-[6px] border border-[var(--line)] bg-white px-2 text-[12px] outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={u.active}
                        onClick={() => saveUsers(users.map((x) => (x.id === u.id ? { ...x, active: !x.active } : x)))}
                        className={cn('relative h-5 w-9 rounded-full transition-colors', u.active ? 'bg-[var(--cyan-600)]' : 'bg-[var(--line-strong)]')}
                      >
                        <motion.span
                          layout
                          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                          className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', u.active ? 'end-[18px]' : 'end-0.5')}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-[var(--ink-400)]">{u.lastLogin}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="مصفوفة الصلاحيات">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead>
              <tr>
                <th className="px-2 py-2 text-start text-[11px] font-medium text-[var(--ink-400)]">القدرة</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-2 py-2 text-center text-[11px] font-medium text-[var(--ink-400)]">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap, ci) => (
                <tr key={cap} className="border-t border-[var(--line)]">
                  <td className="px-2 py-2.5 font-medium text-[var(--ink-700)]">{cap}</td>
                  {ROLES.map((role, ri) => {
                    const on = matrix[role]?.[ci] ?? false;
                    const isOwner = role === 'صاحب الشركة';
                    return (
                      <td key={role} className="px-2 py-2.5 text-center">
                        <motion.button
                          type="button"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: Math.min((ci + ri) * 0.025, 0.4) }}
                          onClick={() => toggleCell(role, ci)}
                          title={isOwner ? 'صلاحيات المالك كاملة' : undefined}
                          className={cn(
                            'relative inline-block h-5 w-9 rounded-full transition-colors',
                            on ? 'bg-[var(--cyan-600)]' : 'bg-[var(--line-strong)]',
                            isOwner && 'cursor-not-allowed opacity-80',
                          )}
                        >
                          <motion.span
                            layout
                            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                            className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', on ? 'end-[18px]' : 'end-0.5')}
                          />
                        </motion.button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* invite modal */}
      <Modal
        open={invite}
        onClose={() => setInvite(false)}
        title="دعوة مستخدم"
        size="sm"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setInvite(false)}>
              إلغاء
            </Btn>
            <Btn
              onClick={() => {
                if (!inviteEmail.includes('@')) return;
                saveUsers([...users, { id: `u${Date.now()}`, name: inviteEmail.split('@')[0], email: inviteEmail, role: inviteRole, active: true, lastLogin: 'لم يدخل بعد' }]);
                logAudit('user', `دعا المستخدم ${inviteEmail} بدور ${inviteRole}`, 'إدارة المستخدمين');
                toast.success('أُرسلت الدعوة');
                setInviteEmail('');
                setInvite(false);
              }}
              disabled={!inviteEmail.includes('@')}
            >
              إرسال الدعوة
            </Btn>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel required>البريد الإلكتروني</FieldLabel>
            <input dir="ltr" type="email" autoFocus value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@shop.dz" className={cn(inputCls, 'font-latin')} />
          </div>
          <div>
            <FieldLabel>الدور</FieldLabel>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])} className={inputCls}>
              {ROLES.filter((r) => r !== 'صاحب الشركة').map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* role change confirm */}
      <Modal
        open={!!confirmRole}
        onClose={() => setConfirmRole(null)}
        title="تغيير الدور"
        size="sm"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmRole(null)}>
              إلغاء
            </Btn>
            <Btn
              onClick={() => {
                if (confirmRole) {
                  saveUsers(users.map((x) => (x.id === confirmRole.user.id ? { ...x, role: confirmRole.role } : x)));
                  logAudit('user', `غيّر دور ${confirmRole.user.name} إلى ${confirmRole.role}`, 'إدارة المستخدمين');
                  toast.success('غُيّر الدور');
                }
                setConfirmRole(null);
              }}
            >
              تأكيد
            </Btn>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-[var(--ink-700)]">
          تعيين دور <strong>{confirmRole?.role}</strong> للمستخدم <strong>{confirmRole?.user.name}</strong>؟ تُطبَّق الصلاحيات الجديدة فورًا.
        </p>
      </Modal>
    </div>
  );
}
