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
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [rulesKey, setRulesKey] = useState(0);

  const refresh = useCallback(() => {
    setSections(db.sections.list());
    setServices(db.services.list());
  }, []);

  const activeSection = useMemo(() => sections.find((s) => s.id === activeSectionId) ?? null, [sections, activeSectionId]);
  const activeService = useMemo(() => services.find((s) => s.id === activeServiceId) ?? null, [services, activeServiceId]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.68, 0.26, 1] }}
      className="flex h-[calc(100dvh-8rem)] overflow-hidden rounded-[14px] border border-[var(--line)] bg-white shadow-[var(--shadow-card)]"
    >
      <SectionsPane
        sections={sections}
        services={services}
        meta={meta}
        setMeta={setMeta}
        activeId={activeSectionId}
        onSelect={(id) => {
          setActiveSectionId(id);
          setActiveServiceId(null);
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
          activeId={activeServiceId}
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
    </motion.div>
  );
}
