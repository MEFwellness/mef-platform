import { Brain, HeartPulse, ShieldAlert } from 'lucide-react';
import type { CoachingDecision } from '@/app/actions/coaching-brain';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const MODE_LABEL: Record<CoachingDecision['mode'], string> = {
  encourage: 'Encourage',
  challenge: 'Challenge',
  recover: 'Recovery',
  educate: 'Educate',
  celebrate: 'Celebrate',
  reset: 'Reset',
  maintain: 'Steady',
};

const CHALLENGE_LABEL: Record<CoachingDecision['challengeLevel'], string> = {
  lighter: 'Lighter today',
  standard: 'Standard',
  stretch: 'Stretch available',
};

/**
 * The Coaching Brain (Milestone 5), read-only, on the coach's client
 * detail page — the same one Daily Decision Object the Daily page renders
 * for the member (app/actions/coaching-brain.ts's getClientCoachingDecision),
 * never a second, coach-side interpretation of what today's coaching is.
 */
export function BrainPanel({ decision }: { decision: CoachingDecision | null }) {
  if (!decision) return null;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Brain className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Coaching Brain</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-medium text-[#1B3A2D]/70">
          Focus: {decision.focusLabel}
        </span>
        <span className="rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-medium text-[#1B3A2D]/70">
          Mode: {MODE_LABEL[decision.mode]}
        </span>
        <span className="rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-medium text-[#1B3A2D]/70">
          {CHALLENGE_LABEL[decision.challengeLevel]}
        </span>
        {decision.riskLevel !== 'none' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            {decision.riskLevel === 'elevated' ? (
              <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <HeartPulse className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            )}
            {decision.riskLevel === 'elevated' ? 'Elevated risk' : 'Watching'}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">{decision.reasonText}</p>

      {decision.coachInsight && (
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{decision.coachInsight}</p>
      )}
    </section>
  );
}
