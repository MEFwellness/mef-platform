'use client';

/**
 * Coach view of what this member's app actually contains, and why.
 *
 * The brief's requirement is exact: "The visibility state per member must be
 * inspectable by a coach (which rules fired for this member and why)." So
 * this panel is not a summary. It lists EVERY feature in the catalog, shown
 * or hidden, each with the plain-language reason the layer reached that
 * answer, grouped by what kind of thing it is.
 *
 * The reasons here are written for a coach, not for the member. The member's
 * own sentence about a reveal is a different string, in Root's voice, and it
 * appears once on her Home. A coach needs to know that a rule about her
 * intake answer fired; she needs to know that Root opened a short sleep
 * check because she said her sleep has been rough.
 *
 * Overrides write through `set_member_feature_visibility` (migration 167),
 * which checks the caller is this member's active coach or a platform
 * administrator. `is_active_coach_for` RLS is the real trust boundary, same
 * as every other panel on this page; the buttons are the interface.
 *
 * Safety-critical rows carry no buttons at all. That is not a styling
 * choice: safety is exempt from visibility in both directions, so there is
 * no override for a coach to make, and offering one would imply a power
 * nobody has.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { setMemberFeatureVisibilityAction } from '@/app/actions/visibility';
import type { FeatureVisibility } from '@/lib/visibility/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const KIND_LABEL: Record<string, string> = {
  assessment: 'Assessments',
  tracker: 'Trackers',
  feature: 'Screens and features',
  card: 'Cards and panels',
  question_set: 'Check-in question sets',
};

const KIND_ORDER = ['assessment', 'tracker', 'feature', 'card', 'question_set'];

const SOURCE_LABEL: Record<string, string> = {
  rule: 'Rule',
  coach: 'Coach',
  member: 'She turned it off',
  grandfathered: 'Already used it',
  migration: 'Carried over',
  safety: 'Safety',
};

function FeatureRow({ feature, memberId }: { feature: FeatureVisibility; memberId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isSafety = feature.source === 'safety';

  function override(state: 'revealed' | 'hidden') {
    setError(null);
    startTransition(async () => {
      const result = await setMemberFeatureVisibilityAction(
        memberId,
        feature.key,
        state,
        state === 'revealed'
          ? 'A coach turned this on for her by hand.'
          : 'A coach turned this off for her by hand.'
      );
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isSafety ? (
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            ) : feature.visible ? (
              <Eye className="h-4 w-4 shrink-0 text-green-700" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <EyeOff className="h-4 w-4 shrink-0 text-[#1B3A2D]/30" strokeWidth={1.75} aria-hidden="true" />
            )}
            <p className="truncate text-sm font-medium text-[#1B3A2D]">{feature.label}</p>
            <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-2 py-0.5 text-[11px] text-[#1B3A2D]/70">
              {SOURCE_LABEL[feature.source] ?? feature.source}
            </span>
            {feature.grandfathered && (
              <span className="shrink-0 rounded-full bg-[#F5B700]/15 px-2 py-0.5 text-[11px] text-[#854D0E]">
                Kept
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">{feature.coachExplanation}</p>
          <p className="mt-0.5 font-mono text-[11px] text-[#1B3A2D]/35">{feature.key}</p>
        </div>

        {!isSafety && (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              disabled={isPending || feature.visible}
              onClick={() => override('revealed')}
              className="rounded-full border border-[#1B3A2D]/15 px-3 py-1.5 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/35 disabled:opacity-35"
            >
              Show
            </button>
            <button
              type="button"
              disabled={isPending || !feature.visible}
              onClick={() => override('hidden')}
              className="rounded-full border border-[#1B3A2D]/15 px-3 py-1.5 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/35 disabled:opacity-35"
            >
              Hide
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </li>
  );
}

export function MemberVisibilityPanel({
  memberId,
  features,
}: {
  memberId: string;
  features: FeatureVisibility[];
}) {
  const [showHidden, setShowHidden] = useState(true);

  const grouped = useMemo(() => {
    const byKind = new Map<string, FeatureVisibility[]>();
    for (const feature of features) {
      if (!showHidden && !feature.visible) continue;
      const bucket = byKind.get(feature.kind);
      if (bucket) bucket.push(feature);
      else byKind.set(feature.kind, [feature]);
    }
    return KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
      kind,
      label: KIND_LABEL[kind] ?? kind,
      items: byKind.get(kind)!,
    }));
  }, [features, showHidden]);

  const visibleCount = features.filter((f) => f.visible).length;

  if (features.length === 0) return null;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            What her app contains
          </p>
          <p className="mt-1 text-sm text-[#1B3A2D]">
            {visibleCount} of {features.length} shown to her right now.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHidden((value) => !value)}
          className="shrink-0 rounded-full border border-[#1B3A2D]/15 px-3 py-1.5 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/35"
        >
          {showHidden ? 'Only what she sees' : 'Show everything'}
        </button>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
        Nothing here deletes or changes any of her data. Showing and hiding decides what is on her
        screens. Anything she has already started, finished or logged into is kept whatever the
        rules say, and safety features cannot be turned off by anyone.
      </p>

      {grouped.map((group) => (
        <div key={group.kind} className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40">
            {group.label}
          </p>
          <ul className="mt-1 divide-y divide-[#1B3A2D]/5">
            {group.items.map((feature) => (
              <FeatureRow key={feature.key} feature={feature} memberId={memberId} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
