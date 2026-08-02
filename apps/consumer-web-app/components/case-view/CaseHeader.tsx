import type { CaseHeader as CaseHeaderData } from '@/lib/case-view/types';

export function CaseHeader({ header }: { header: CaseHeaderData }) {
  return (
    <div className="mef-card p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
        {header.isVerbatimQuote ? 'In your own words' : "What you're working on"}
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
        {header.isVerbatimQuote ? `“${header.title}”` : header.title}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6B7A72]">
        Everything below is organized around this: what&apos;s being investigated, what&apos;s been ruled out, and
        how this is actually changing for you.
      </p>
    </div>
  );
}
