/**
 * The Movement Session experience — reached only by tapping into today's
 * session from the Movement Dashboard. Organized into the seven session
 * sections (preparation/breathing/mobility/activation/strength/
 * conditioning/recovery), each an expandable accordion, each containing
 * only the exercises the decision engine actually included today.
 */

import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodaysMovementSession } from '@/app/actions/movement';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildMovementEntryContext } from '@/lib/conversation-coach/entryContext';
import { MovementSectionAccordion } from '@/components/movement/MovementSectionAccordion';
import { MovementExerciseCard } from '@/components/movement/MovementExerciseCard';
import { MovementSessionControls } from '@/components/movement/MovementSessionControls';
import { RECOVERY_STATUS_LABEL, RECOVERY_STATUS_STYLES } from '@/lib/movement/status';
import { MOVEMENT_SESSION_SECTION_ORDER } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function MovementSessionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, isCoach, session] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
    getTodaysMovementSession(),
  ]);

  if (!session) redirect('/movement');

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  const recoveryStyles = RECOVERY_STATUS_STYLES[session.recovery_status];
  const sectionsPresent = MOVEMENT_SESSION_SECTION_ORDER.filter((section) =>
    session.exercises.some((e) => e.section === section)
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <header className="flex items-center justify-between pt-0 pb-6">
          <Link
            href={'/movement' as Route}
            className="flex items-center gap-2 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Movement
          </Link>
          <AvatarLink firstName={firstName} />
        </header>

        <div className="flex items-center gap-3">
          <Image
            src="/images/rooted-reset-logo.png"
            alt="Rooted Reset"
            width={28}
            height={28}
            style={{ objectFit: 'contain', borderRadius: '8px', flexShrink: 0 }}
          />
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
            {session.focus_summary}
          </h1>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${recoveryStyles.bg} ${recoveryStyles.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${recoveryStyles.dot}`} aria-hidden="true" />
            {RECOVERY_STATUS_LABEL[session.recovery_status]}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7A72]">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />~
            {session.estimated_duration_minutes} min
          </span>
        </div>

        <div className="mt-6">
          <MovementSessionControls sessionId={session.id} status={session.status} />
        </div>

        <div className="mt-6 space-y-4">
          {sectionsPresent.length === 0 && (
            <section className={`${CARD} p-6 text-center`}>
              <p className="text-sm leading-relaxed text-[#6B7A72]">
                No exercises are available for today's session yet.
              </p>
            </section>
          )}

          {sectionsPresent.map((section, index) => {
            const exercises = session.exercises
              .filter((e) => e.section === section)
              .sort((a, b) => a.sequence_index - b.sequence_index);
            const completedCount = exercises.filter((e) => e.completed).length;

            return (
              <MovementSectionAccordion
                key={section}
                section={section}
                exerciseCount={exercises.length}
                completedCount={completedCount}
                defaultOpen={index === 0}
              >
                {exercises.map((sessionExercise) => (
                  <MovementExerciseCard
                    key={sessionExercise.id}
                    sessionExercise={sessionExercise}
                    disabled={session.status === 'completed' || session.status === 'skipped'}
                  />
                ))}
              </MovementSectionAccordion>
            );
          })}
        </div>
      </main>

      <BottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="movement"
        entryContext={buildMovementEntryContext(session)}
      />
    </div>
  );
}
