/**
 * GradusMind "Rising GM" mark: a wood-type G beside an M whose right leg climbs higher
 * (gradus = step), with the learner's red dot arriving on top.
 */
export function GradusMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="GradusMind">
      <text x="17" y="51" textAnchor="middle" fontFamily="var(--font-anton), Anton, Impact, sans-serif" fontSize="38" fill="var(--color-poster)">G</text>
      <path d="M33 51 V24 L43.5 39 L54 17 V51" fill="none" stroke="var(--color-poster)" strokeWidth="7" strokeLinejoin="miter" />
      <circle cx="54" cy="8.5" r="5" fill="var(--color-signal)" />
    </svg>
  );
}

/** Mark + wordmark lockup, with an optional product line underneath. */
export function GradusLockup({ product, size = 30 }: { product?: string; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <GradusMark size={size} />
      <div className="leading-none">
        <div className="text-[17px] font-bold tracking-tight text-ink">GradusMind</div>
        {product && <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">{product}</div>}
      </div>
    </div>
  );
}
