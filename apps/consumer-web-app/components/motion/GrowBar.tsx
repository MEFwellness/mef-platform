/**
 * Root Motion System — generic Grow primitive (Bible §3 "Grow").
 * Generalizes the width-fill technique already proven in
 * components/closing-screen/ClosingScreenPrimitives.tsx's private
 * `ProgressConnector` (Tailwind's `transition-[width]` utility, 700ms
 * ease-out, `motion-reduce:transition-none`) into a reusable bar any
 * future screen can use for a real progress value — that private
 * component itself is left untouched (Bible §3's own rule for this
 * type: Grow must always map to a real number, never decoratively).
 * Pure function, no hooks — `motion-reduce:` is a Tailwind variant that
 * resolves the reduced-motion media query at the CSS layer, same
 * mechanism as everywhere else in this app.
 */

export function GrowBar({
  valuePercent,
  trackClassName = 'bg-[#1B3A2D]/10',
  fillClassName = 'bg-[#1B3A2D]',
  className = '',
}: {
  /** A real, already-computed 0-100 value — never an arbitrary/decorative fill. */
  valuePercent: number;
  trackClassName?: string;
  fillClassName?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, valuePercent));

  return (
    <div className={`h-1 w-full overflow-hidden rounded-full ${trackClassName} ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${fillClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
