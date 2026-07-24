import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import { FilePlus2, LayoutGrid, Search, Settings2, User, FileText } from 'lucide-react';
import { db } from '@/lib/storage';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACTIONS = [
  { id: 'act-new-devis', label: 'إنشاء Devis جديد', icon: FilePlus2, to: '/devis/new' },
  { id: 'act-montage', label: 'فتح المونتاج الذكي', icon: LayoutGrid, to: '/montage' },
  { id: 'act-rules', label: 'تعديل قواعد الأسعار', icon: Settings2, to: '/settings#rules' },
  { id: 'act-clients', label: 'العملاء والمشاريع', icon: User, to: '/clients' },
  { id: 'act-quotes', label: 'سجل عروض الأسعار', icon: FileText, to: '/devis' },
];

/** Ctrl+K palette: fuzzy search across clients / Devis / services + quick actions. */
export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const data = useMemo(() => {
    if (!open) return { clients: [], devis: [], services: [] };
    db.ensureSeeded();
    return {
      clients: db.clients.list().slice(0, 20),
      devis: db.devis.list().slice(-20).reverse(),
      services: db.services.list(),
    };
  }, [open]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] grid place-items-start justify-center bg-[rgba(21,23,30,0.3)] pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.22 }}
            className="w-[560px] max-w-[92vw] overflow-hidden rounded-[14px] border border-[var(--line)] bg-white shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="البحث والأوامر" shouldFilter>
              <div className="flex items-center gap-2 border-b border-[var(--line)] px-4">
                <Search size={16} className="shrink-0 text-[var(--ink-400)]" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="ابحث أو نفّذ أمرًا…"
                  className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--ink-400)]"
                />
                <kbd dir="ltr" className="font-latin shrink-0 rounded border border-[var(--line)] bg-[var(--paper-100)] px-1.5 py-0.5 text-[10px] text-[var(--ink-400)]">
                  ESC
                </kbd>
              </div>
              <Command.List className="max-h-[320px] overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-[13px] text-[var(--ink-400)]">
                  لا توجد نتائج مطابقة.
                </Command.Empty>
                <Command.Group heading={<span className="px-2 text-[11px] text-[var(--ink-400)]">أوامر</span>}>
                  {ACTIONS.map((a) => (
                    <Command.Item
                      key={a.id}
                      value={a.label}
                      onSelect={() => go(a.to)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[14px] text-[var(--ink-700)] aria-selected:bg-[var(--cyan-50)] aria-selected:text-[var(--cyan-600)]"
                    >
                      <a.icon size={16} />
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
                {data.devis.length > 0 && (
                  <Command.Group heading={<span className="px-2 text-[11px] text-[var(--ink-400)]">عروض الأسعار</span>}>
                    {data.devis.map((d) => (
                      <Command.Item
                        key={d.id}
                        value={d.number}
                        onSelect={() => go('/devis')}
                        className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[14px] text-[var(--ink-700)] aria-selected:bg-[var(--cyan-50)]"
                      >
                        <FileText size={16} />
                        <span dir="ltr" className="font-latin tabular-nums">{d.number}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {data.clients.length > 0 && (
                  <Command.Group heading={<span className="px-2 text-[11px] text-[var(--ink-400)]">العملاء</span>}>
                    {data.clients.map((c) => (
                      <Command.Item
                        key={c.id}
                        value={c.name}
                        onSelect={() => go(`/clients?client=${c.id}`)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[14px] text-[var(--ink-700)] aria-selected:bg-[var(--cyan-50)]"
                      >
                        <User size={16} />
                        {c.name}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
