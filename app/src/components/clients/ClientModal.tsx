import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Client } from '@/lib/types';
import { db, uid } from '@/lib/storage';
import { Btn, FieldLabel, inputCls, Modal } from '@/components/settings/Overlay';
import { logAudit } from '@/components/settings/audit';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  /** when set → edit mode */
  client: Client | null;
  onSaved: () => void;
}

/** Add/edit client modal (md), 2-col fields. */
export default function ClientModal({ open, onClose, client, onSaved }: Props) {
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', city: '', address: '', notes: '' });
  const [saved, setSaved] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // reset form when the modal opens (setState-during-render pattern, no effect)
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSaved(false);
      setForm({
        name: client?.name ?? '',
        company: client?.company ?? '',
        phone: client?.phone ?? '',
        email: client?.email ?? '',
        city: client?.address?.split('،').pop()?.trim() ?? '',
        address: client?.address ?? '',
        notes: client?.notes ?? '',
      });
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = form.name.trim() && form.phone.trim();

  const save = () => {
    if (!valid) return;
    const payload = {
      name: form.name.trim(),
      company: form.company.trim() || undefined,
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      address: form.address.trim() || form.city.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (client) {
      db.clients.update(client.id, payload);
      toast.success('حُدّثت بيانات العميل');
    } else {
      db.clients.create({ id: uid('cl'), ...payload, createdAt: new Date().toISOString() });
      logAudit('catalog', `أضاف عميلًا جديدًا «${payload.name}»`, `عميل: ${payload.name}`);
      toast.success('تمت إضافة العميل');
    }
    setSaved(true);
    setTimeout(() => {
      onSaved();
      onClose();
    }, 350);
  };

  const fields = (
    <div className="grid grid-cols-2 gap-3">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <FieldLabel required htmlFor="client-name">الاسم</FieldLabel>
        <input id="client-name" autoFocus value={form.name} onChange={set('name')} className={inputCls} placeholder="يوسف بن عمر" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <FieldLabel htmlFor="client-company">الشركة</FieldLabel>
        <input id="client-company" value={form.company} onChange={set('company')} className={inputCls} placeholder="مطعم الزيتونة" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <FieldLabel required htmlFor="client-phone">الهاتف</FieldLabel>
        <input id="client-phone" dir="ltr" value={form.phone} onChange={set('phone')} className={cn(inputCls, 'font-latin')} placeholder="0550 12 34 56" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <FieldLabel htmlFor="client-email">البريد</FieldLabel>
        <input id="client-email" dir="ltr" type="email" value={form.email} onChange={set('email')} className={cn(inputCls, 'font-latin')} placeholder="client@mail.dz" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <FieldLabel htmlFor="client-city">المدينة</FieldLabel>
        <input id="client-city" value={form.city} onChange={set('city')} className={inputCls} placeholder="الجزائر" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
        <FieldLabel htmlFor="client-address">العنوان</FieldLabel>
        <input id="client-address" value={form.address} onChange={set('address')} className={inputCls} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="col-span-2">
        <FieldLabel htmlFor="client-notes">ملاحظات</FieldLabel>
        <textarea id="client-notes" value={form.notes} onChange={set('notes')} rows={2} className={cn(inputCls, 'h-auto py-2')} />
      </motion.div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? 'تعديل العميل' : 'عميل جديد'}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn onClick={save} disabled={!valid}>
            {saved ? (
              <motion.svg key="ok" width="16" height="16" viewBox="0 0 16 16" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
                <motion.path
                  d="M3 8.5 L6.5 12 L13 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.svg>
            ) : null}
            حفظ العميل
          </Btn>
        </>
      }
    >
      {fields}
    </Modal>
  );
}
