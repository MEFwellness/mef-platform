/**
 * Expandable education cards (Energy, Recovery, Meal Timing, Satiety,
 * Food Quality). Built on native <details>/<summary> rather than a
 * hand-rolled ARIA accordion: it's keyboard-operable and screen-reader
 * friendly by default (open/closed state, toggling) with zero extra
 * state management, which matches this prompt's own instruction that
 * "the structure matters more than the wording" right now. Copy is
 * intentionally placeholder (EDUCATION_TOPICS).
 */

import { ChevronDown } from 'lucide-react';
import { EDUCATION_TOPICS } from '@/lib/primal-pattern/premium/content';

export function EducationAccordion() {
  return (
    <section className="rounded-[32px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Learn More</p>

      <div className="mt-4 divide-y divide-[#EDEBE3]">
        {EDUCATION_TOPICS.map((topic) => (
          <details key={topic.id} className="group py-4 first:pt-0 last:pb-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]">
              <span>
                <span className="block text-sm font-semibold text-[#1B3A2D]">{topic.title}</span>
                <span className="mt-0.5 block text-xs text-[#6B7A72]">{topic.summary}</span>
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-[#6B7A72] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{topic.body}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
