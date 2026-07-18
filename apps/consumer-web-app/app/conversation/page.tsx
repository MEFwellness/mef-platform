import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Sprout } from 'lucide-react';
import type { ConversationEntryPoint } from '@mef/shared-types-contracts';
import { getOrStartConversationAction } from '@/app/actions/conversation-coach';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { BackButton } from '@/components/BackButton';
import { SUGGESTED_PROMPTS } from '@/lib/conversation-coach/suggestedPrompts';
import { ConversationView } from './ConversationView';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const VALID_ENTRY_POINTS = new Set<ConversationEntryPoint>([
  'nav',
  'today_focus',
  'today_easier_option',
  'today_why',
  'today_completed',
  'progress_pattern',
  'progress_improved',
  'progress_focus',
  'checkin_explain',
  'checkin_feeling',
  'dashboard',
  'profile',
  'assessment',
  'body_assessment',
]);

export default async function CoachingConversationPage({
  searchParams,
}: {
  searchParams: { entry?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const requestedEntry = searchParams.entry;
  const entryPoint: ConversationEntryPoint =
    requestedEntry && VALID_ENTRY_POINTS.has(requestedEntry as ConversationEntryPoint)
      ? (requestedEntry as ConversationEntryPoint)
      : 'nav';

  const [isCoach, { data: profile }, thread] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    getOrStartConversationAction(entryPoint),
  ]);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Home" />

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Sprout className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Coaching Conversation</p>
          </div>
          <AvatarLink firstName={firstName} />
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Root
        </h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
          Your MEF Wellness Coach
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          Built around your history. Focused on your future.
        </p>

        {!thread ? (
          <section className={`${CARD} mt-6 p-8`}>
            <p className="text-sm text-[#6B7A72]">
              Give it a moment and try again, Root is having a little trouble getting started.
            </p>
          </section>
        ) : (
          <div className="mt-6">
            <ConversationView
              session={thread.session}
              initialMessages={thread.messages}
              entryPoint={entryPoint}
              suggestedPrompts={SUGGESTED_PROMPTS[entryPoint]}
            />
          </div>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
