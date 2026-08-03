import type { CaseHeader as CaseHeaderData } from '@/lib/case-view/types';

/**
 * `memoryCallback` (Root Presence System, requirement 4) is the member's
 * real check-in tenure ("You've been checking in with me for 23 days
 * now..."), never the goal — the goal is already this header's own title,
 * so a goal callback here would just repeat it. Only ever passed for the
 * member's own view, never the coach's (see CaseViewBody's own doc).
 */
export function CaseHeader({ header, memoryCallback }: { header: CaseHeaderData; memoryCallback?: string | null }) {
  return (
    <div className="mef-card p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
        {header.isVerbatimQuote ? 'In your own words' : "What you're working on"}
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
        {header.isVerbatimQuote ? `“${header.title}”` : header.title}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6B7A72]">
        Everything below is organized around this: what I&apos;m investigating, what I&apos;ve ruled out, and
        how this is actually changing for you.
      </p>
      {memoryCallback && <p className="mt-3 text-[13px] leading-relaxed text-[#1B3A2D]">{memoryCallback}</p>}
    </div>
  );
}
