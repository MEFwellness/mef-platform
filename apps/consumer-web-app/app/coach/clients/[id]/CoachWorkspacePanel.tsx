/**
 * Coach Workspace — Root Coaching Conversation Engine (Prompt 13). Coach-only,
 * read-only: a conversation summary, current priorities, recent coaching
 * themes, and suggested discussion topics with questions worth asking.
 * Purely presentational, same discipline as RecommendationsPanel/
 * RootMapPanel/LongitudinalIntelligencePanel — everything here is already
 * computed by getClientCoachWorkspaceSummary(). Members never see this panel
 * or any of its language.
 */

import { MessageCircle, HelpCircle } from 'lucide-react';
import type { CoachWorkspaceSummary } from '@/lib/root-coaching-engine';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function CoachWorkspacePanel({ summary }: { summary: CoachWorkspaceSummary }) {
  const hasContent =
    summary.currentPriorities.length > 0 ||
    summary.recentCoachingThemes.length > 0 ||
    summary.suggestedDiscussionTopics.length > 0;

  if (!hasContent) return null;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#3E5C46]">
        <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Coach Workspace</p>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{summary.conversationSummary}</p>

      {summary.currentPriorities.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Current priorities</p>
          <ul className="mt-1.5 space-y-1">
            {summary.currentPriorities.map((priority) => (
              <li key={priority} className="text-sm text-[#1B3A2D]">
                {priority}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.recentCoachingThemes.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Recent coaching themes</p>
          <ul className="mt-1.5 space-y-1.5">
            {summary.recentCoachingThemes.map((theme) => (
              <li key={theme} className="text-sm text-[#1B3A2D]/80">
                {theme}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.suggestedDiscussionTopics.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Suggested discussion topics</p>
          <ul className="mt-1.5 divide-y divide-[#1B3A2D]/5">
            {summary.suggestedDiscussionTopics.map((topic) => (
              <li key={`${topic.conversationType}-${topic.topicLabel}`} className="py-2.5">
                <p className="text-sm font-medium text-[#1B3A2D]">{topic.topicLabel}</p>
                <p className="text-xs text-[#6B7A72]">{topic.sourceState.replaceAll('_', ' ')}</p>
                {topic.questions.map((question) => (
                  <p key={question} className="mt-1 flex items-start gap-1.5 text-xs text-[#6B7A72]">
                    <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    {question}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
