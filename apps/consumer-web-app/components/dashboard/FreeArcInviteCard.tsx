import Link from 'next/link';
import type { Route } from 'next';
import { Sparkles, ArrowRight } from 'lucide-react';
import type { CatalogCard } from '@/app/actions/questionnaireCatalog';

/**
 * Free Arc Discoverability fix (2026-08-03) — the dashboard-card fallback
 * for the new `free_arc_available` Root pop-up (see
 * app/actions/rootPopupMessages.ts and lib/root-popup-messages/freeArc.ts):
 * the next unstarted conversation among Core Values Snapshot, Life Signal
 * Check, and Readiness Pulse. Same dark forest-green/gold "a real message
 * from Root" treatment and same "Waiting on you" badge convention as
 * AssignedQuestionnairePriorityCard, rendered right alongside it above the
 * dashboard's `!hasCheckins` gate (app/dashboard/page.tsx) — a brand-new
 * member with zero check-ins is exactly who most needs this to be
 * reachable, since it used to require an unrelated first check-in before
 * any path (card or pop-up) to the free arc existed at all. Renders
 * nothing once all three conversations are complete.
 */
export function FreeArcInviteCard({
  card,
  highPriority = false,
}: {
  card: CatalogCard;
  highPriority?: boolean;
}) {
  if (!card.primaryHref) return null;
  const ctaLabel = card.flags.inProgress ? 'Continue' : 'Start now';

  return (
    <div className="mef-animate-in relative overflow-hidden rounded-[28px] bg-[#1B3A2D] p-6 text-[#F5F0E4] shadow-[0_20px_50px_-16px_rgba(27,58,45,0.5)]">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#C4A050]/16 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        From Root
      </div>
      <h2 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]">
        {card.title}
      </h2>
      <p className="relative mt-2 text-sm leading-relaxed text-[#F5F0E4]/75">{card.description}</p>
      {highPriority && (
        <span className="relative mt-3 inline-flex w-fit shrink-0 items-center rounded-full bg-[#C4A050]/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#F5D98A]">
          Waiting on you
        </span>
      )}
      <Link
        href={card.primaryHref as Route}
        className="mef-press relative mt-5 inline-flex items-center gap-1.5 rounded-2xl bg-[#F5F0E4] px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </div>
  );
}
