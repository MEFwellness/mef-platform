/**
 * Coach Member Detail: what this member actually entered.
 *
 * WHY THIS SCREEN EXISTS. Before it, a coach opening a client saw a great
 * deal ABOUT her and very little OF her. The client detail page renders
 * today's check-in as eight tiles and an energy chart, and around twenty
 * panels of derived intelligence: Case View, root cause signals, the root
 * map, recommendations, escalations, longitudinal patterns. Her actual
 * answers existed in only two places: one completed questionnaire at a time,
 * behind its own link, and the conversation panel. Her day-by-day check-in
 * answers, the adaptive driver questions she is asked inside the check-in,
 * and the goals she stated on the welcome flow had no coach-facing surface at
 * all. The last of those was not even readable: member_goal_selections had no
 * coach policy until migration 158, so the coach Case View has always
 * rendered her stated goal as absent rather than showing it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not repeat Case View. Patterns,
 * drivers, correlations and anything else derived from these answers stay
 * where they already are, and this page links there. Nothing on this screen
 * is scored, averaged, correlated, inferred or generated, and there is no
 * model anywhere in its path.
 *
 * AUTHORIZATION. Three independent layers, none of them new. middleware.ts
 * refuses anyone without the coach role before this route renders. This page
 * checks the role again itself, so the page and the middleware cannot
 * disagree. Underneath both, every read runs through the coach's own
 * Supabase client under row level security, so an assigned coach reads his
 * member because `is_active_coach_for` says so, and a coach who is not
 * assigned to this member gets no rows even if the first two layers were
 * bypassed entirely.
 *
 * NEWEST FIRST EVERYWHERE, and an unanswered question always says so.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { redirect, notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { readMemberEntries, DEFAULT_ENTRY_DAYS, clampDays } from '@/lib/coach-member-entries/data';
import {
  CASE_VIEW_POINTER,
  EMPTY_COPY,
  ENTRIES_INTRO,
  NOT_ANSWERED,
  unavailableCopy,
} from '@/lib/coach-member-entries/present';
import type { EnteredAnswer, SectionResult } from '@/lib/coach-member-entries/types';
import { formatDisplayDate } from '@/lib/time/displayDate';

/** One date format for the whole screen, so a check-in day and a completion date never read differently. */
const ENTRY_DATE: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

export const metadata: Metadata = { title: 'What she entered' };

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** The day-range choices. Kept small: this is a reading screen, not an analysis one. */
const RANGE_CHOICES = [30, 90, 180] as const;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#3E5C46]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-5">
      <p className="text-[14px] text-[#1B3A2D]">{title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#6B7A72]">{body}</p>
    </div>
  );
}

function Unavailable({ section, reason }: { section: string; reason: string }) {
  return (
    <div className="rounded-2xl border border-[#8B2F2F]/25 bg-[#8B2F2F]/[0.06] px-4 py-4">
      <p className="text-[13px] leading-relaxed text-[#8B2F2F]">{unavailableCopy(section, reason)}</p>
    </div>
  );
}

/** One question and her answer. An unanswered one is stated, never blank. */
function AnswerRow({ answer }: { answer: EnteredAnswer }) {
  const answered = answer.answer !== null;
  return (
    <div
      data-answer-key={answer.key}
      data-answered={answered ? 'true' : 'false'}
      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1"
    >
      <span className="text-[13px] text-[#1B3A2D]/75">{answer.question}</span>
      <span
        className={`text-[13px] ${answered ? 'text-[#1B3A2D]' : 'italic text-[#6B7A72]'}`}
      >
        {answered ? answer.answer : NOT_ANSWERED}
      </span>
    </div>
  );
}

/** Renders a section that can be empty, missing, or full, keeping all three distinguishable. */
function SectionBody<T>({
  result,
  label,
  empty,
  render,
}: {
  result: SectionResult<T>;
  label: string;
  empty: { title: string; body: string };
  render: (items: T[]) => React.ReactNode;
}) {
  if (!result.available) return <Unavailable section={label} reason={result.reason} />;
  if (result.items.length === 0) return <Empty title={empty.title} body={empty.body} />;
  return <>{render(result.items)}</>;
}

export default async function CoachMemberEntriesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  // Checked here as well as in middleware, so a page and the middleware can
  // never disagree about who may open this route.
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  // RLS (coach_read_assigned_client_profile, migration 16) returns no row for
  // a client this coach is not assigned to, so an unassigned id is a 404 here
  // rather than a page with empty sections.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();

  const firstName = clientProfile.display_name?.split(' ')[0] ?? 'This member';
  const timezone = clientProfile.timezone ?? 'America/New_York';
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
    .toISOString()
    .slice(0, 10);

  const requestedDays = Number(
    Array.isArray(searchParams?.days) ? searchParams?.days[0] : searchParams?.days
  );
  const days = clampDays(Number.isFinite(requestedDays) ? requestedDays : DEFAULT_ENTRY_DAYS);

  const entries = await readMemberEntries(supabase, params.id, {
    displayName: clientProfile.display_name,
    today,
    days,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}` as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to {firstName}
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          What {firstName} entered
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6B7A72]">{ENTRIES_INTRO}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B7A72]">
          {CASE_VIEW_POINTER}{' '}
          <Link
            href={`/coach/clients/${params.id}#case-view` as Route}
            className="underline decoration-[#C4A050] underline-offset-2 hover:text-[#1B3A2D]"
          >
            Open Case View
          </Link>
          .
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
            Looking back
          </span>
          {RANGE_CHOICES.map((choice) => {
            const selected = choice === days;
            return (
              <Link
                key={choice}
                href={`/coach/clients/${params.id}/entries?days=${choice}` as Route}
                aria-current={selected ? 'true' : undefined}
                data-range-days={choice}
                data-selected={selected ? 'true' : 'false'}
                className={`mef-focus-ring inline-flex items-center rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${
                  selected
                    ? 'bg-[#1B3A2D] font-medium text-[#F5F0E4]'
                    : 'bg-white/70 text-[#1B3A2D]/65 hover:text-[#1B3A2D]'
                }`}
              >
                {choice} days
              </Link>
            );
          })}
          <span className="text-[12px] text-[#6B7A72]">
            {entries.range.start} to {entries.range.end}
          </span>
        </div>

        <div className="mt-6 space-y-5">
          {/* Goals first: what she said she wanted is the frame for everything below it. */}
          <Section
            title="What she said she wanted"
            description="Her own goal selections, newest first. This list is insert-only, so a change is a new entry and what she used to say stays visible."
          >
            <SectionBody
              result={entries.goals}
              label="Her stated goals"
              empty={EMPTY_COPY.goals}
              render={(goals) => (
                <ol className="space-y-3">
                  {goals.map((goal) => (
                    <li key={goal.id} data-goal-entry={goal.id} className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="text-[13px] text-[#1B3A2D]">
                          {goal.primaryGoal ? (
                            <>
                              Matters most: <span className="font-medium">{goal.primaryGoal}</span>
                            </>
                          ) : (
                            <span className="italic text-[#6B7A72]">
                              She was never asked which one matters most
                            </span>
                          )}
                        </span>
                        <span className="text-[12px] text-[#6B7A72]">
                          {formatDisplayDate(goal.createdAt, ENTRY_DATE)}
                        </span>
                      </div>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {goal.goals.map((label) => (
                          <li
                            key={label}
                            className="rounded-full bg-white px-2.5 py-1 text-[12px] text-[#1B3A2D]"
                          >
                            {label}
                          </li>
                        ))}
                      </ul>
                      {goal.goalsOther ? (
                        <p className="mt-2 border-l-2 border-[#C4A050] pl-3 text-[13px] italic leading-relaxed text-[#1B3A2D]">
                          {goal.goalsOther}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[11.5px] text-[#6B7A72]">{goal.source}</p>
                    </li>
                  ))}
                </ol>
              )}
            />
          </Section>

          <Section
            title="Her check-ins"
            description={`Every Daily Reset she completed in this window, newest first, with every question she was asked and exactly what she answered.`}
          >
            <SectionBody
              result={entries.checkins}
              label="Her check-in history"
              empty={EMPTY_COPY.checkins}
              render={(checkins) => (
                <ol className="space-y-4">
                  {checkins.map((checkin) => (
                    <li
                      key={checkin.localDate}
                      data-checkin-date={checkin.localDate}
                      className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3.5"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="text-[14px] font-medium text-[#1B3A2D]">
                          {formatDisplayDate(checkin.localDate, ENTRY_DATE)}
                        </span>
                        {checkin.editedAt ? (
                          <span className="text-[11.5px] text-[#6B7A72]">
                            She edited this day afterwards
                          </span>
                        ) : null}
                      </div>

                      {checkin.flaggedNewOrWorseningConcern ? (
                        <p className="mt-2 rounded-xl border border-[#C4A050]/45 bg-[#C4A050]/12 px-3 py-2 text-[12.5px] text-[#1B3A2D]">
                          She told the check-in something was new or getting worse that day.
                        </p>
                      ) : null}

                      <div className="mt-2 divide-y divide-[#1B3A2D]/8">
                        {checkin.answers.map((answer) => (
                          <AnswerRow key={answer.key} answer={answer} />
                        ))}
                      </div>

                      {checkin.readiness.length > 0 ? (
                        <>
                          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
                            Morning questions
                          </p>
                          <div className="divide-y divide-[#1B3A2D]/8">
                            {checkin.readiness.map((answer) => (
                              <AnswerRow key={answer.key} answer={answer} />
                            ))}
                          </div>
                        </>
                      ) : null}

                      {checkin.probeAnswers.length > 0 ? (
                        <>
                          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
                            The follow-up questions she was asked that day
                          </p>
                          <div className="divide-y divide-[#1B3A2D]/8">
                            {checkin.probeAnswers.map((answer) => (
                              <AnswerRow key={answer.key} answer={answer} />
                            ))}
                          </div>
                        </>
                      ) : null}

                      {checkin.note ? (
                        <>
                          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
                            In her own words
                          </p>
                          <p className="mt-1 border-l-2 border-[#C4A050] pl-3 text-[13px] italic leading-relaxed text-[#1B3A2D]">
                            {checkin.note}
                          </p>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            />
          </Section>

          <Section
            title="What she has completed"
            description="Questionnaires and guided experiences she finished, newest first. Her answers open in the reader that already renders them in full, rather than being shown a second way here."
          >
            <SectionBody
              result={entries.submissions}
              label="Her completed questionnaires and experiences"
              empty={EMPTY_COPY.submissions}
              render={(submissions) => (
                <ol className="space-y-2">
                  {submissions.map((submission) => (
                    <li key={`${submission.kind}-${submission.id}`} data-submission={submission.id}>
                      {submission.href ? (
                        <Link
                          href={submission.href as Route}
                          className="mef-focus-ring block rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3 transition-colors hover:bg-[#1B3A2D]/[0.06]"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <span className="text-[14px] text-[#1B3A2D]">{submission.title}</span>
                            <span className="text-[12px] text-[#6B7A72]">
                              {formatDisplayDate(submission.completedAt, ENTRY_DATE)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] text-[#6B7A72]">
                            {submission.kind}. Open to read her answers.
                          </p>
                        </Link>
                      ) : (
                        <div className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <span className="text-[14px] text-[#1B3A2D]">{submission.title}</span>
                            <span className="text-[12px] text-[#6B7A72]">
                              {formatDisplayDate(submission.completedAt, ENTRY_DATE)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] text-[#6B7A72]">
                            {submission.noReaderReason ?? 'There is no reader for this one yet.'}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            />
          </Section>

          <Section
            title="Her conversations with Root"
            description="What she actually said, and what Root said back, newest first. Nothing summarised."
          >
            <SectionBody
              result={entries.conversations}
              label="Her conversations with Root"
              empty={EMPTY_COPY.conversations}
              render={(sessions) => (
                <ol className="space-y-4">
                  {sessions.map((session) => (
                    <li
                      key={session.id}
                      data-conversation-session={session.id}
                      className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3.5"
                    >
                      <p className="text-[12px] text-[#6B7A72]">
                        {formatDisplayDate(session.startedAt, ENTRY_DATE)}
                      </p>
                      {session.messages.length === 0 ? (
                        <p className="mt-2 text-[13px] italic text-[#6B7A72]">
                          This conversation was started and nothing was said in it.
                        </p>
                      ) : (
                        <ol className="mt-2 space-y-2">
                          {session.messages.map((message) => (
                            <li key={message.id} data-message-role={message.role}>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1B3A2D]/45">
                                {message.role === 'member' ? firstName : 'Root'}
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1B3A2D]">
                                {message.content}
                              </p>
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            />
          </Section>
        </div>
      </main>

      {/* middleware.ts and this page's own guard both already required the
          coach role, so isCoach is always true here. */}
      <BottomNav isCoach />
    </div>
  );
}
