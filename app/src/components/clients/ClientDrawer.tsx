import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Copy, FilePlus2, FolderPlus, Mail, MapPin, Pencil, Phone } from 'lucide-react';
import { toast } from 'sonner';
import type { Client } from '@/lib/types';
import { db } from '@/lib/storage';
import { formatDA } from '@/lib/units';
import StatusPill from '@/components/ds/StatusPill';
import { Btn, Drawer } from '@/components/settings/Overlay';
import { avatarColor, initials, type ClientStats } from './crm-meta';

interface Props {
  client: Client | null;
  stats: ClientStats | undefined;
  onClose: () => void;
  onEdit: (c: Client) => void;
}

/** Client detail drawer (left, 480px). */
export default function ClientDrawer({ client, stats, onClose, onEdit }: Props) {
  const navigate = useNavigate();
  const projects = useMemo(() => (client ? db.projects.byClient(client.id) : []), [client]);
  const devis = useMemo(() => (client ? db.devis.list().filter((d) => d.clientId === client.id) : []), [client]);

  if (!client) return null;
  const { bg, fg } = avatarColor(client.name);
  const s = stats ?? { devis: devis.length, accepted: 0, total: 0, lastActivity: '—' };

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast.success(`نُسخ ${label}`);
  };

  return (
    <Drawer
      open={!!client}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <motion.span
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-[18px] font-bold"
            style={{ backgroundColor: bg, color: fg }}
          >
            {initials(client.name)}
          </motion.span>
          <div className="min-w-0">
            <h3 className="truncate text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{client.name}</h3>
            <p className="truncate text-[12px] text-[var(--ink-500)]">{client.company ?? 'بدون شركة'}</p>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => onEdit(client)}>
            <Pencil size={13} /> تعديل
          </Btn>
        </div>
      }
      footer={
        <>
          <Btn
            className="flex-1"
            onClick={() => {
              toast.success(`تم اختيار العميل: ${client.name}`);
              navigate(`/devis/new?client=${client.id}`);
            }}
          >
            <FilePlus2 size={15} /> Devis لهذا العميل
          </Btn>
          <Btn variant="ghost" onClick={() => toast.info('أنشئ المشروع من تبويب المشاريع')}>
            <FolderPlus size={15} /> مشروع
          </Btn>
        </>
      }
    >
      <div className="space-y-5">
        {/* info grid */}
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.07 }} className="grid grid-cols-2 gap-2">
          {[
            { icon: Phone, label: 'الهاتف', value: client.phone, ltr: true },
            { icon: Mail, label: 'البريد', value: client.email, ltr: true },
            { icon: MapPin, label: 'المدينة / العنوان', value: client.address, ltr: false },
          ].map(({ icon: Icon, label, value, ltr }) => (
            <div key={label} className="group rounded-[10px] border border-[var(--line)] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[var(--ink-400)]">
                <Icon size={12} /> {label}
                {value && (
                  <button
                    type="button"
                    aria-label={`نسخ ${label}`}
                    onClick={() => copy(value, label)}
                    className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Copy size={11} />
                  </button>
                )}
              </div>
              {/* latin values (phone/email) right-aligned — matches the Clients table cells */}
              <div dir={ltr ? 'ltr' : undefined} className={ltr ? 'font-latin text-start text-[13px] text-[var(--ink-700)]' : 'text-[13px] text-[var(--ink-700)]'}>
                {value ?? '—'}
              </div>
            </div>
          ))}
        </motion.div>

        {/* stats */}
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.14 }} className="grid grid-cols-3 gap-2">
          {[
            { label: 'عروض', value: String(s.devis) },
            { label: 'مقبولة', value: String(s.accepted) },
            { label: 'إجمالي', value: formatDA(s.total) },
          ].map((t, i) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.06, duration: 0.7 }}
              className="rounded-[10px] bg-[var(--paper-100)] p-3 text-center"
            >
              <div className="text-[11px] text-[var(--ink-400)]">{t.label}</div>
              <div dir="ltr" className="font-latin mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--ink-900)]">
                {t.value}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* timeline */}
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.21 }}>
          <h4 className="mb-2 text-[14px] font-semibold text-[var(--ink-900)]">آخر التفاعلات</h4>
          <div className="space-y-1.5">
            {devis.slice(0, 3).map((d, i) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.28 + i * 0.06 }}
                className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2"
              >
                <span dir="ltr" className="font-latin text-[12px] font-semibold text-[var(--ink-900)]">
                  {d.number}
                </span>
                <StatusPill status={d.status} />
                <span className="ms-auto" dir="ltr">
                  <span className="font-latin text-[12px] tabular-nums text-[var(--ink-700)]">{formatDA(d.total)}</span>
                </span>
                <VersionBadgeMini v={d.rulesVersion} />
              </motion.div>
            ))}
            {devis.length === 0 && projects.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-3 py-4 text-center text-[12px] text-[var(--ink-400)]">
                لا توجد تفاعلات بعد — أنشئ أول Devis لهذا العميل.
              </div>
            )}
            {projects.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.06 }}
                className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12px]"
              >
                <span className="font-medium text-[var(--ink-700)]">مشروع: {p.name}</span>
                <span className="ms-auto text-[10px] text-[var(--ink-400)]">
                  {p.status === 'done' ? 'اكتمل' : p.status === 'active' ? 'نشط' : 'قيد الإنتاج'}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {client.notes && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="rounded-[10px] bg-[var(--paper-100)] p-3 text-[12px] leading-5 text-[var(--ink-500)]">
            {client.notes}
          </motion.div>
        )}
      </div>
    </Drawer>
  );
}

function VersionBadgeMini({ v }: { v: number }) {
  return (
    <span className="rounded-full border border-[var(--line)] px-1.5 py-0.5 text-[9px] text-[var(--ink-400)]">
      <span dir="ltr" className="font-latin">
        v{v}
      </span>
    </span>
  );
}
