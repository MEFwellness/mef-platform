/**
 * The one plain sentence a member reads when something new appears.
 *
 * "You mentioned your sleep has been rough, so I have opened a short sleep
 * check for you." In Root's voice, no jargon, no evidence-tier names, no em
 * dashes, and never a claim about her health. The sentences themselves live
 * on each catalog entry (lib/visibility/catalog.ts) so that the person
 * retuning a rule writes the sentence in the same place as the rule.
 *
 * Said once. `acknowledgeRevealsAction` marks each sentence as delivered
 * the moment this renders, so a reveal explains itself on the load it
 * happens and never again. That write is deliberately best effort: if it
 * fails, she reads a friendly sentence twice, which is a far better failure
 * than a reveal that never explains itself.
 *
 * Rendered on Home only, directly under the day's one priority. It is
 * explicitly NOT a card per feature scattered across the app: the whole
 * point of this build is that Home stops competing with itself, and a reveal
 * announcement is a sentence, not a tenth call to action. There are no
 * buttons on it.
 */

import { Sparkles } from 'lucide-react';
import type { FeatureVisibility } from '@/lib/visibility/types';
import { AcknowledgeReveals } from './AcknowledgeReveals';

export function NewlyRevealedNotice({ reveals }: { reveals: FeatureVisibility[] }) {
  const withSentences = reveals.filter((r) => r.revealSentence !== null);
  if (withSentences.length === 0) return null;

  return (
    <section
      className="mt-3 rounded-[24px] border border-[#F5B700]/35 bg-[#F5B700]/[0.07] p-5"
      aria-label="Something new from Root"
    >
      <AcknowledgeReveals featureKeys={withSentences.map((r) => r.key)} />
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wider">Something new</p>
      </div>
      <ul className="mt-2 space-y-2">
        {withSentences.map((reveal) => (
          <li key={reveal.key} className="text-sm leading-relaxed text-[#1B3A2D]">
            {reveal.revealSentence}
          </li>
        ))}
      </ul>
    </section>
  );
}
