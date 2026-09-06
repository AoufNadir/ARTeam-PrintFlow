import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Section, Service } from '@/lib/types';
import { db } from '@/lib/storage';
import SectionsPane from '@/components/builder/SectionsPane';
import ServicesPane from '@/components/builder/ServicesPane';
import ServiceEditor from '@/components/builder/ServiceEditor';
import { useBuilderMeta } from '@/components/builder/meta';

/**
 * منشئ المنتجات — 3-pane master-detail studio:
 * الأقسام → الخدمات → محرر الخدمة (الحقول / قواعد التسعير / المراحل / معاينة).
 */
export default function Builder() {
  const [sections, setSections] = useState<Section[]>(() => db.sections.list());
  const [services, setServices] = useState<Service[]>(() => db.services.list());
  const [meta, setMeta] = useBuilderMeta();
  const [activeSectionId, setActiveSectionId] = useState<string | null>(sections[0]?.id ?? null);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(() => {
    const firstSectionId = sections[0]?.id;
    return firstSectionId ? services.find((service) => service.sectionId === firstSectionId)?.id ?? null : null;
  });
  const [rulesKey, setRulesKey] = useState(0);

  const refresh = useCallback(() => {
    setSections(db.sections.list());
    setServices(db.services.list());
  }, []);

  const activeSection = useMemo(() => sections.find((s) => s.id === activeSectionId) ?? null, [sections, activeSectionId]);
  const activeService = useMemo(() => {
    const selected = services.find((service) => service.id === activeServiceId && service.sectionId === activeSectionId);
    if (selected) return selected;
    return activeSection ? services.find((service) => service.sectionId === activeSection.id) ?? null : null;
  }, [activeSection, activeSectionId, activeServiceId, services]);
  const activeSectionServices = useMemo(
    () => (activeSection ? services.filter((service) => service.sectionId === activeSection.id).length : 0),
    [activeSection, services],
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.68, 0.26, 1] }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-9 font-bold text-[var(--ink-900)]">منشئ الخدمات</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-500)]">
            اختر قسمًا، ثم خدمة، وعدّل الحقول والتسعير والإنتاج من مكان واحد.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {activeSection && (
            <span className="rounded-full bg-white px-3 py-1 text-[var(--ink-600)] shadow-sm">
              {activeSection.name} · <span dir="ltr" className="font-latin">{activeSectionServices}</span> خدمات
            </span>
          )}
          {activeService && (
            <span className="rounded-full bg-[var(--cyan-50)] px-3 py-1 font-semibold text-[var(--cyan-600)]">
              {activeService.name}
            </span>
          )}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 overflow-hidden rounded-[14px] border border-[var(--line)] bg-white shadow-[var(--shadow-card)] xl:h-[calc(100dvh-13rem)] xl:grid-cols-[minmax(230px,0.8fr)_minmax(300px,1fr)_minmax(0,2.2fr)] 2xl:grid-cols-[minmax(300px,0.9fr)_minmax(380px,1.05fr)_minmax(0,2.6fr)]">
        <SectionsPane
          sections={sections}
          services={services}
          meta={meta}
          setMeta={setMeta}
          activeId={activeSectionId}
          onSelect={(id) => {
            setActiveSectionId(id);
            setActiveServiceId(services.find((service) => service.sectionId === id)?.id ?? null);
          }}
          refresh={refresh}
        />
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 0.68, 0.26, 1] }}
          className="contents"
        >
          <ServicesPane
            section={activeSection}
            services={services}
            meta={meta}
            setMeta={setMeta}
            activeId={activeService?.id ?? null}
            onSelect={setActiveServiceId}
            refresh={refresh}
            sectionDisabled={!!activeSection && meta.disabledSections.includes(activeSection.id)}
          />
        </motion.div>
        <ServiceEditor
          service={activeService}
          section={activeSection}
          meta={meta}
          setMeta={setMeta}
          refresh={refresh}
          rulesKey={rulesKey}
          onRulesChanged={() => setRulesKey((k) => k + 1)}
        />
      </div>
    </motion.div>
  );
}
