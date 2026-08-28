/**
 * The button that actually starts an assessment.
 *
 * A PAGE RENDER MUST NOT INSERT A ROW (2026-08-27). Every one of these
 * used to be a plain `<Link>` to a take URL, and the take page created the
 * member's draft while rendering. That made "open this URL" and "start
 * this assessment" the same act, which is why a read-only crawl, a
 * bookmark, a refresh and the browser Back button could all begin an
 * assessment on her behalf.
 *
 * A form posting to a Server Action is the whole fix. Back and Forward
 * cannot replay a POST, a prefetch never fires it, and the take route it
 * lands on is a pure read. Same visual weight as the Link it replaces, so
 * nothing about the screen changes for her.
 */
export function BeginAssessmentForm({
  action,
  label,
  variant = 'primary',
  className = '',
}: {
  /** A Server Action that starts or resumes, then redirects. It never returns. */
  action: () => Promise<void>;
  label: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  const style =
    variant === 'primary'
      ? 'block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]'
      : 'block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]';

  return (
    <form action={action} className={className}>
      <button type="submit" className={style}>
        {label}
      </button>
    </form>
  );
}
