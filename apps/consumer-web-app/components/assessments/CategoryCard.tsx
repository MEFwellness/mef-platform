import Link from 'next/link';
import type { Route } from 'next';
import { ChevronRight } from 'lucide-react';
import { PriorityBadge } from './PriorityBadge';
import type { PriorityLevel } from '@/lib/assessments/engine/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

type Props = {
  href: string;
  name: string;
  score: number;
  maxScore: number;
  priority: PriorityLevel;
  description: string;
};

export function CategoryCard({ href, name, score, maxScore, priority, description }: Props) {
  return (
    <Link
      href={href as Route}
      className={`${CARD} group block p-6 transition hover:bg-[#FAFAF8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A2D]`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-[#1B3A2D]">{name}</p>
        <PriorityBadge priority={priority} />
      </div>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-none text-[#1B3A2D]">
          {score}
        </span>
        <span className="text-sm text-[#6B7A72]">/ {maxScore}</span>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{description}</p>
      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#1B3A2D] opacity-70 transition group-hover:opacity-100">
        View details
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </div>
    </Link>
  );
}
