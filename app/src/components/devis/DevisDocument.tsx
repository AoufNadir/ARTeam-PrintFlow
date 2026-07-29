import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { CropMarks } from '@/components/ds/SectionCard';
import VersionBadge from '@/components/ds/VersionBadge';
import StatusPill from '@/components/ds/StatusPill';
import { db } from '@/lib/storage';
import { loadCompanySettings } from '@/lib/company-settings';
import type { Client, Devis, ProductionStage, Project, Unit } from '@/lib/types';
import { isBillableDevisItem, isCustomProjectItem, PRODUCTION_STAGE_LABELS } from '@/lib/custom-project';
import { formatDA, formatDimension } from '@/lib/units';
import {
  addDays,
  devisTotals,
  formatDateAr,
  itemDims,
  itemSpecAr,
} from './devis-utils';
import { cn } from '@/lib/utils';

export interface DevisDocumentProps {
  devis: Devis;
  client?: Client;
  project?: Project;
  unit: Unit;
  /** stagger content sections (drawer opening) */
  animated?: boolean;
  onShowRules?: () => void;
  showInternalSnapshot?: boolean;
}

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];

function stagePublicSpec(stage: ProductionStage, unit: Unit): string {
  const parts = [
    stage.paper?.name,
    stage.sheetSize?.label,
    stage.productSize ? formatDimension(stage.productSize.widthMm, stage.productSize.heightMm, unit) : undefined,
    stage.printMethod === 'recto-verso' ? 'وجهان' : stage.printMethod === 'recto' ? 'وجه واحد' : stage.printMethod,
    stage.colorLabel,
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * A4-proportioned "paper" Devis document: letterhead, client block, items
 * table, totals, frozen price-version snapshot banner, CMYK footer.
 * Rendered inside the detail drawer and the wizard preview modal.
 */
export default function DevisDocument({ devis, client, project, unit, animated = true, onShowRules, showInternalSnapshot }: DevisDocumentProps) {
  const totals = devis.totals ?? devisTotals(devis.items, {
    discount: devis.discount,
    extraFees: devis.extraFees,
    taxRate: devis.taxRate,
    advance: devis.advance,
  });
  const company = loadCompanySettings();
  // صالح حتى: التاريخ المختار في العرض، وإلا fallback معقول = إنشاء + 15 يومًا
  const validUntil = devis.validUntil ?? addDays(devis.createdAt, 15);
  const shouldShowSnapshot = showInternalSnapshot || Boolean(onShowRules);

  const section = (i: number, children: React.ReactNode, className?: string) => (
    <motion.div
      initial={animated ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + i * 0.07, duration: 0.35, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );

  return (
    <div className="relative rounded-[4px] bg-white p-7 shadow-[var(--shadow-card)] ring-1 ring-[var(--line)]">
      {/* bleed dashes + crop marks (document motif) */}
      <div className="pointer-events-none absolute inset-1 rounded-[3px] border-[1.5px] border-dashed border-[var(--magenta-600)]/40" aria-hidden />
      <CropMarks opacity={0.55} offset={6} />

      {/* letterhead */}
      {section(0, (
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <img src={company.logo || '/logo.svg'} alt="ARTeam PrintFlow" className="h-11 w-11 rounded-[8px] object-contain" />
            <div>
              <div className="text-[15px] font-bold text-[var(--ink-900)]">{company.name}</div>
              <div dir="ltr" className="font-latin text-[11px] text-[var(--ink-400)]">{company.email}</div>
              <div className="mt-0.5 text-[11px] text-[var(--ink-500)]">{company.address} — <span dir="ltr" className="font-latin">{company.phone}</span></div>
            </div>
          </div>
          <div className="text-end">
            <div dir="ltr" className="font-latin text-[17px] font-bold text-[var(--ink-900)]">Devis N° {devis.number}</div>
            {(devis.revision ?? 1) > 1 && <div dir="ltr" className="font-latin mt-0.5 text-[11px] font-semibold text-[var(--cyan-600)]">Revision R{devis.revision}</div>}
            {devis.title && <div className="mt-0.5 text-[13px] font-medium text-[var(--ink-700)]">{devis.title}</div>}
            <div className="mt-1 text-[12px] text-[var(--ink-500)]">التاريخ: {formatDateAr(devis.createdAt)}</div>
            <div className="text-[12px] text-[var(--ink-500)]">صالح حتى {formatDateAr(validUntil)}</div>
            {devis.deliveryDate && (
              <div className="text-[12px] text-[var(--ink-500)]">التسليم المتوقع: {formatDateAr(devis.deliveryDate)}</div>
            )}
            <div className="mt-1.5"><StatusPill status={devis.status} /></div>
          </div>
        </div>
      ))}

      {/* client block */}
      {section(1, (
        <div className="mt-4 rounded-[10px] bg-[var(--paper-100)] px-4 py-3">
          <div className="text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)]">إلى</div>
          <div className="mt-0.5 text-[15px] font-semibold text-[var(--ink-900)]">
            {client ? client.name : '—'}
            {client?.company && <span className="font-normal text-[var(--ink-500)]"> — {client.company}</span>}
          </div>
          {project && <div className="mt-0.5 text-[12px] text-[var(--ink-500)]">المشروع: {project.name}</div>}
          {client?.phone && <div dir="ltr" className="font-latin mt-0.5 text-end text-[12px] text-[var(--ink-400)]">{client.phone}</div>}
        </div>
      ))}

      {/* items table */}
      {section(2, (
        <table className="mt-5 w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 border-[var(--ink-900)] text-[11px] tracking-[0.04em] text-[var(--ink-400)]">
              <th className="py-2 text-start font-medium">#</th>
              <th className="py-2 text-start font-medium">الخدمة</th>
              <th className="py-2 text-end font-medium">الكمية</th>
              <th className="py-2 text-end font-medium">سعر الوحدة</th>
              <th className="py-2 text-end font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {devis.items.filter(isBillableDevisItem).map((item, i) => {
              const custom = isCustomProjectItem(item);
              const service = custom ? undefined : db.services.get(item.serviceId);
              const spec = itemSpecAr(service, item);
              const { dims, qty } = itemDims(service, item, unit);
              return (
                <motion.tr
                  key={item.id}
                  initial={animated ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.04, duration: 0.3, ease: EASE }}
                  className="border-b border-[var(--line)] align-top"
                >
                  <td className="py-2.5 pe-2"><span dir="ltr" className="font-latin text-[var(--ink-400)]">{i + 1}</span></td>
                  <td className="py-2.5 pe-2">
                    <div className="font-semibold text-[var(--ink-900)]">
                      <span dir={custom ? 'rtl' : 'ltr'} className={custom ? '' : 'font-latin'}>{item.serviceName}</span>
                      {spec && <span className="font-normal text-[var(--ink-700)]"> — {spec}</span>}
                    </div>
                    {!custom && <div className="mt-0.5 text-[11px] text-[var(--ink-400)]">
                      {dims && <span dir="ltr" className="font-latin">{dims}</span>}
                      {dims && ' — '}
                      <span dir="ltr" className="font-latin">{qty}</span> نسخة
                    </div>}
                    {custom && (
                      <div className="mt-2 overflow-hidden rounded-[7px] border border-[var(--line)] text-[10px] font-normal">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 bg-[var(--paper-100)] px-2 py-1 text-[var(--ink-500)]"><span>المرحلة</span><span>الكمية</span><span>الأوراق</span></div>
                        {item.customProject.stages.map((stage) => (
                          <div key={stage.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-[var(--line)] px-2 py-1.5">
                            <span><span className="block">{stage.name} — {PRODUCTION_STAGE_LABELS[stage.kind]}</span>{stagePublicSpec(stage, unit) && <span className="mt-0.5 block text-[9px] text-[var(--ink-400)]">{stagePublicSpec(stage, unit)}</span>}</span>
                            <span dir="ltr" className="font-latin">{stage.quantity}</span>
                            <span dir="ltr" className="font-latin">{stage.montageResult?.sheetsNeeded ?? stage.calculation.sheets ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 text-end"><span dir="ltr" className="font-latin tabular-nums">{qty}</span></td>
                  <td className="py-2.5 text-end"><span dir="ltr" className="font-latin tabular-nums">{formatDA(item.unitPrice)}</span></td>
                  <td className="py-2.5 text-end"><span dir="ltr" className="font-latin font-semibold tabular-nums text-[var(--ink-900)]">{formatDA(item.total)}</span></td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      ))}

      {/* totals */}
      {section(3, (
        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1.5 text-[13px]">
            <div className="flex justify-between text-[var(--ink-700)]">
              <span>الإجمالي HT</span>
              <span dir="ltr" className="font-latin tabular-nums">{formatDA(totals.itemsHt)}</span>
            </div>
            {totals.quoteDiscount > 0 && (
              <div className="flex justify-between text-[var(--ink-500)]">
                <span>خصم تجاري</span>
                <span dir="ltr" className="font-latin tabular-nums">-{formatDA(totals.quoteDiscount)}</span>
              </div>
            )}
            {totals.extraFees > 0 && (
              <div className="flex justify-between text-[var(--ink-500)]">
                <span>مصاريف إضافية</span>
                <span dir="ltr" className="font-latin tabular-nums">{formatDA(totals.extraFees)}</span>
              </div>
            )}
            <div className="flex justify-between text-[var(--ink-500)]">
              <span>TVA <span dir="ltr" className="font-latin">{Math.round(totals.taxRate * 10000) / 100}%</span></span>
              <span dir="ltr" className="font-latin tabular-nums">{formatDA(totals.tva)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-[var(--line)] pt-2">
              <span className="font-bold text-[var(--ink-900)]">الإجمالي TTC</span>
              <motion.span
                dir="ltr"
                className="font-latin text-[22px] leading-7 font-semibold tabular-nums text-[var(--cyan-600)]"
                initial={animated ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.8 }}
              >
                {formatDA(totals.ttc)}
              </motion.span>
            </div>
            {totals.advance > 0 && (
              <>
                <div className="flex justify-between text-[var(--ink-500)]">
                  <span>التسبيق</span>
                  <span dir="ltr" className="font-latin tabular-nums">-{formatDA(totals.advance)}</span>
                </div>
                <div className="flex justify-between text-[var(--ink-900)]">
                  <span className="font-semibold">الباقي للدفع</span>
                  <span dir="ltr" className="font-latin font-semibold tabular-nums">{formatDA(totals.balanceDue)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      ))}

      {(devis.clientNotes || devis.commercialTerms?.paymentTerms || devis.commercialTerms?.deliveryMethod || devis.commercialTerms?.deliveryDelay) &&
        section(4, (
          <div className="mt-5 rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] px-4 py-3 text-[12px] leading-6 text-[var(--ink-700)]">
            {devis.clientNotes && <p>{devis.clientNotes}</p>}
            {devis.commercialTerms?.paymentTerms && <p>شروط الدفع: {devis.commercialTerms.paymentTerms}</p>}
            {devis.commercialTerms?.deliveryDelay && <p>مدة الإنجاز: {devis.commercialTerms.deliveryDelay}</p>}
            {devis.commercialTerms?.deliveryMethod && <p>طريقة التسليم: {devis.commercialTerms.deliveryMethod}</p>}
          </div>
        ))}

      {/* frozen snapshot banner */}
      {shouldShowSnapshot && section(5, (
        <div className={cn('mt-5 flex items-center gap-2.5 rounded-[10px] bg-[var(--cyan-50)] px-4 py-3 text-[12px] leading-5 text-[var(--ink-700)]')}>
          <Lock size={15} className="shrink-0 text-[var(--cyan-600)]" />
          <span className="flex-1">
            هذا العرض مثبَّت على قواعد الأسعار <span dir="ltr" className="font-latin font-semibold">v{devis.rulesVersion}</span> بتاريخ {formatDateAr(devis.createdAt)} — تعديل الأسعار الحالية لا يؤثر عليه.
          </span>
          <VersionBadge version={devis.rulesVersion} />
          {onShowRules && (
            <button
              type="button"
              onClick={onShowRules}
              className="shrink-0 rounded-[8px] px-2 py-1 font-medium text-[var(--cyan-600)] transition-colors hover:bg-[var(--cyan-100)]"
            >
              عرض قواعد هذه النسخة
            </button>
          )}
        </div>
      ))}

      {/* footer: CMYK bar */}
      {section(6, (
        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-3">
          <div className="flex gap-1" aria-hidden>
            <span className="h-1 w-5 rounded-full bg-[#0284C7]" />
            <span className="h-1 w-5 rounded-full bg-[#DB2777]" />
            <span className="h-1 w-5 rounded-full bg-[#EAB308]" />
            <span className="h-1 w-5 rounded-full bg-[#15171E]" />
          </div>
          <span className="text-[11px] text-[var(--ink-400)]">أُنشئ بواسطة <span dir="ltr" className="font-latin">ARTeam PrintFlow</span></span>
        </div>
      ))}
    </div>
  );
}
