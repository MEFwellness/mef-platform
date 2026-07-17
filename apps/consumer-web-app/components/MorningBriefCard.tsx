/**
 * Root's Daily Morning Brief — the Root Proactive Coaching Engine's
 * flagship surface (section 1). Renders exactly what
 * lib/coaching-engine/morningBrief.ts composed and
 * app/actions/coaching-engine.ts's getMyMorningBrief() generated (or
 * app/api/cron/daily-coaching-scan pre-warmed) for today; every section
 * is omitted, not filled with placeholder copy, when there's nothing real
 * behind it — same "never use generic text if meaningful data exists
 * [otherwise say nothing]" rule every other card in this app already
 * follows (see app/dashboard/page.tsx's own header comment on the
 * now-removed fabricated Health Score/Four Doctors cards).
 */

import {
  Sparkles,
  HeartPulse,
  Moon,
  Flame,
  ListChecks,
  MessageCircleHeart,
  TrendingUp,
  BookmarkCheck,
  type LucideIcon,
} from 'lucide-react';
import type { MorningBrief } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function greetingWord(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type BriefLineProps = {
  icon: LucideIcon;
  label: string;
  text: string;
};

function BriefLine({ icon: Icon, label, text }: BriefLineProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFF6F1] text-[#1B3A2D]">
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden={true} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">{label}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]">{text}</p>
      </div>
    </div>
  );
}

export function MorningBriefCard({ brief }: { brief: MorningBrief }) {
  return (
    <section className={`${CARD} mef-animate-in p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Root&apos;s Morning Brief</p>
      </div>
      <h2 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
        {greetingWord()}, {brief.greeting_name}
      </h2>

      <div className="mt-5 space-y-4">
        <BriefLine icon={Flame} label="Today's Focus" text={brief.focus_label} />
        {brief.recovery_summary && (
          <BriefLine icon={HeartPulse} label="Recovery Status" text={brief.recovery_summary} />
        )}
        {brief.sleep_summary && <BriefLine icon={Moon} label="Sleep" text={brief.sleep_summary} />}
        {brief.stress_summary && (
          <BriefLine icon={HeartPulse} label="Stress Level" text={brief.stress_summary} />
        )}
        {brief.notable_pattern_title && brief.notable_pattern_summary && (
          <BriefLine
            icon={TrendingUp}
            label={brief.notable_pattern_title}
            text={brief.notable_pattern_summary}
          />
        )}
        {brief.habit_to_prioritize && (
          <BriefLine
            icon={ListChecks}
            label="Habit to Prioritize Today"
            text={brief.habit_to_prioritize}
          />
        )}
        {brief.incomplete_recommendation && (
          <BriefLine
            icon={BookmarkCheck}
            label="Still Waiting On"
            text={brief.incomplete_recommendation}
          />
        )}
        <BriefLine
          icon={Sparkles}
          label="Coaching Recommendation"
          text={brief.coaching_recommendation}
        />
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#FAFAF8] p-4">
        <MessageCircleHeart
          className="mt-0.5 h-4 w-4 shrink-0 text-[#F5B700]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <p className="text-sm italic leading-relaxed text-[#1B3A2D]">{brief.encouraging_message}</p>
      </div>
    </section>
  );
}
