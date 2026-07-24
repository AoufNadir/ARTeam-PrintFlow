import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Machine, PaperType } from '@/lib/types';
import { db } from '@/lib/storage';
import CompanySection from '@/components/settings/CompanySection';
import MachinesSection from '@/components/settings/MachinesSection';
import PaperSection from '@/components/settings/PaperSection';
import RulesSection from '@/components/settings/RulesSection';
import UsersSection from '@/components/settings/UsersSection';
import UnitsSection from '@/components/settings/UnitsSection';
import DatabaseSection from '@/components/settings/DatabaseSection';
import AuditSection from '@/components/settings/AuditSection';
import { cn } from '@/lib/utils';

const NAV = [
  { id: 'company', label: 'الشركة' },
  { id: 'machines', label: 'الماكينات' },
  { id: 'paper', label: 'الورق والمواد' },
  { id: 'rules', label: 'قواعد التسعير العامة' },
  { id: 'users', label: 'المستخدمون والأدوار' },
  { id: 'units', label: 'الوحدات والأرقام' },
  { id: 'database', label: 'قاعدة البيانات (Supabase)' },
  { id: 'audit', label: 'سجل العمليات' },
] as const;

type SectionId = (typeof NAV)[number]['id'];

/** الإعدادات — sticky sub-nav (scrollspy) + 8 tunable sections. */
export default function Settings() {
  const [active, setActive] = useState<SectionId>('company');
  const [flash, setFlash] = useState<SectionId | null>(null);
  const [machines, setMachines] = useState<Machine[]>(() => db.machines.list());
  const [papers, setPapers] = useState<PaperType[]>(() => db.papers.list());
  const [rulesKey, setRulesKey] = useState(0);

  const refreshMachines = useCallback(() => setMachines(db.machines.list()), []);
  const refreshPapers = useCallback(() => setPapers(db.papers.list()), []);
  const bumpRules = useCallback(() => setRulesKey((k) => k + 1), []);

  // scrollspy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id as SectionId);
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    NAV.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const jump = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
    setFlash(id);
    setTimeout(() => setFlash(null), 900);
  };

  return (
    <div className="flex items-start gap-6">
      {/* sticky sub-nav */}
      <nav className="sticky top-[88px] hidden w-[240px] shrink-0 lg:block">
        <h1 className="mb-4 px-3 text-[27px] leading-9 font-bold text-[var(--ink-900)]">الإعدادات</h1>
        <ul className="space-y-0.5">
          {NAV.map((n, i) => (
            <motion.li key={n.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: i * 0.04 }}>
              <button
                type="button"
                onClick={() => jump(n.id)}
                className={cn(
                  'relative w-full rounded-[10px] px-3 py-2 text-start text-[14px] transition-colors',
                  active === n.id ? 'font-semibold text-[var(--cyan-600)]' : 'text-[var(--ink-500)] hover:bg-[var(--paper-100)] hover:text-[var(--ink-700)]',
                )}
              >
                {active === n.id && (
                  <motion.span
                    layoutId="settings-nav-pill"
                    className="absolute inset-0 -z-10 rounded-[10px] bg-[var(--cyan-50)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                {n.label}
              </button>
            </motion.li>
          ))}
        </ul>
      </nav>

      {/* content */}
      <div className="min-w-0 max-w-[900px] flex-1 space-y-6">
        <h1 className="text-[27px] leading-9 font-bold text-[var(--ink-900)] lg:hidden">الإعدادات</h1>
        <motion.section id="company" key="company" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className={cn('scroll-mt-24', flash === 'company' && 'rounded-[14px] ring-2 ring-[var(--cyan-100)]')}>
          <CompanySection />
        </motion.section>
        <motion.section id="machines" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }} transition={{ duration: 0.4 }} className="scroll-mt-24">
          <MachinesSection machines={machines} refresh={refreshMachines} />
        </motion.section>
        <motion.section id="paper" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }} transition={{ duration: 0.4 }} className="scroll-mt-24">
          <PaperSection papers={papers} refresh={refreshPapers} />
        </motion.section>
        <motion.section id="rules" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }} transition={{ duration: 0.4 }} className="scroll-mt-24">
          <RulesSection rulesKey={rulesKey} onRulesChanged={bumpRules} />
        </motion.section>
        <motion.section id="users" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }} transition={{ duration: 0.4 }} className="scroll-mt-24">
          <UsersSection />
        </motion.section>
        <motion.section id="units" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }} transition={{ duration: 0.4 }} className="scroll-mt-24">
          <UnitsSection />
        </motion.section>
        <motion.section id="database" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }} transition={{ duration: 0.4 }} className="scroll-mt-24">
          <DatabaseSection />
        </motion.section>
        <motion.section id="audit" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }} transition={{ duration: 0.4 }} className="scroll-mt-24">
          <AuditSection />
        </motion.section>
      </div>
    </div>
  );
}
