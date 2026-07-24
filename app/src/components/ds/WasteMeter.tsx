import { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface WasteMeterProps {
  /** waste percentage 0..100 (gauge saturates at 30%+) */
  percent: number;
  size?: number;
  className?: string;
  animated?: boolean;
}

function colorFor(p: number): string {
  if (p < 8) return '#16A34A';
  if (p < 18) return '#D97706';
  return '#DC2626';
}

/** Semicircle gauge 0→30%+, gradient fill success→warning→danger, animated sweep. */
export default function WasteMeter({ percent, size = 120, className, animated = true }: WasteMeterProps) {
  // unique gradient id — multiple meters on one page must not share "waste-grad"
  const gradId = `waste-grad-${useId().replace(/:/g, '')}`;
  const [display, setDisplay] = useState(animated ? 0 : percent);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!animated || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(percent);
      return;
    }
    const from = display;
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(from + (percent - from) * eased);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percent]);

  const clamped = Math.min(display, 40);
  const frac = Math.min(1, clamped / 30); // 30% => full gauge
  const w = size;
  const h = size / 2 + 10;
  const cx = w / 2;
  const cy = size / 2;
  const R = size / 2 - 10;
  const angle = Math.PI * (1 - frac); // PI..0 (left to right in screen space)
  const arc = (r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const progressArc = (r: number) => {
    const endX = cx + r * Math.cos(angle);
    const endY = cy - r * Math.sin(angle);
    const large = frac > 0.5 ? 1 : 0;
    return `M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${endX} ${endY}`;
  };

  return (
    <div className={cn('inline-flex flex-col items-center', className)} dir="ltr">
      <svg width={w} height={h}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#16A34A" />
            <stop offset="55%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#DC2626" />
          </linearGradient>
        </defs>
        <path d={arc(R)} fill="none" stroke="var(--paper-100)" strokeWidth={10} strokeLinecap="round" />
        {frac > 0.005 && (
          <motion.path
            d={progressArc(R)}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={10}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="-mt-7 flex items-baseline gap-0.5">
        <span className="font-latin text-[22px] leading-7 font-semibold tabular-nums" style={{ color: colorFor(display) }}>
          {display.toFixed(1)}
        </span>
        <span className="font-latin text-[13px] text-[var(--ink-400)]">%</span>
      </div>
    </div>
  );
}
