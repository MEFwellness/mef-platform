import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import type { ConversationEntryPoint } from '@mef/shared-types-contracts';
import { getOrStartConversationAction } from '@/app/actions/conversation-coach';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
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

  const [isCoach, thread] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getOrStartConversationAction(entryPoint),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Coaching Conversation</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Your MEF Coach
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          A coaching conversation grounded in your own history and today&apos;s focus — not a
          general chatbot.
        </p>

        {!thread ? (
          <section className={`${CARD} mt-6 p-8`}>
            <p className="text-sm text-[#6B7A72]">
              We couldn&apos;t start a conversation right now. Please try again shortly.
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
