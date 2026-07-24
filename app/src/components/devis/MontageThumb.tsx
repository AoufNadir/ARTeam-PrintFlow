import { motion } from 'framer-motion';
import type { MontageResult } from '@/lib/types';

export interface MontageThumbProps {
  result: MontageResult;
  /** pixel width of the thumbnail (height follows sheet aspect) */
  width?: number;
  animated?: boolean;
}

/**
 * Static mini render of an imposition layout: sheet outline (dashoffset draw),
 * printable-area tint, and pieces popping in with a 25ms stagger. Each piece
 * carries the magenta dashed bleed halo (design.md §5).
 */
export default function MontageThumb({ result, width = 160, animated = true }: MontageThumbProps) {
  const pad = 8;
  const scale = (width - pad * 2) / result.sheetWidthMm;
  const height = result.sheetHeightMm * scale + pad * 2;
  const X = (mm: number) => pad + mm * scale;
  const Y = (mm: number) => pad + mm * scale;
  const pa = result.printableArea;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible rounded-[8px]"
      style={{ backgroundImage: 'url(/texture-grid.svg)', backgroundSize: '120px', backgroundColor: 'var(--paper-100)' }}
      role="img"
      aria-label="معاينة توزيع المونتاج"
    >
      {/* sheet */}
      <motion.rect
        x={pad}
        y={pad}
        width={result.sheetWidthMm * scale}
        height={result.sheetHeightMm * scale}
        fill="#FFFFFF"
        stroke="var(--ink-900)"
        strokeWidth={1.2}
        initial={animated ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      {/* printable area */}
      <rect
        x={X(pa.x)}
        y={Y(pa.y)}
        width={pa.w * scale}
        height={pa.h * scale}
        fill="none"
        stroke="var(--cyan-500)"
        strokeWidth={0.8}
        strokeDasharray="3 2"
        opacity={0.7}
      />
      {/* pieces */}
      {result.placed.map((p, i) => (
        <motion.g
          key={`${p.groupId}-${i}`}
          initial={animated ? { scale: 0.6, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.35 + i * 0.025, duration: 0.25, ease: [0.22, 0.68, 0.26, 1] }}
          style={{ transformOrigin: `${X(p.x + p.w / 2)}px ${Y(p.y + p.h / 2)}px` }}
        >
          <rect x={X(p.x)} y={Y(p.y)} width={p.w * scale} height={p.h * scale} fill={p.color} fillOpacity={0.16} stroke={p.color} strokeWidth={0.9} />
          <rect
            x={X(p.x) - 1.5}
            y={Y(p.y) - 1.5}
            width={p.w * scale + 3}
            height={p.h * scale + 3}
            fill="none"
            stroke="var(--magenta-600)"
            strokeWidth={0.6}
            strokeDasharray="2 2"
            rx={1}
            opacity={0.8}
          />
        </motion.g>
      ))}
    </svg>
  );
}
