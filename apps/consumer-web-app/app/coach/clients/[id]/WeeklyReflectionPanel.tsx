'use client';

/**
 * The coach's Weekly Reflection panel.
 *
 * ONE PICTURE, TWO PEOPLE. The recap rendered here is the identical
 * component the member read, from the identical stored descriptors
 * (components/weekly-reflection/WeeklyReflectionRecapBody.tsx), so the
 * Friday review starts from a week both of them saw the same way. Her five
 * answers sit underneath it, in her own words, unedited.
 *
 * A SELECTABLE LIST OF WEEKS, for reading across them. Newest first, and
 * the newest is open on arrival, because the week a coach came here for is
 * almost always the one that just finished.
 *
 * Client-side only in the sense that the week selector and the Assign
 * button are stateful. Every row was fetched on the server by
 * getClientWeeklyReflectionsAction and
 * getClientWeeklyReflectionAssignStateAction, which is where the coach
 * check and the test-account exclusion live.
 *
 * THE ASSIGN BUTTON, SAME PATTERN AS THE STRESS & LOAD PANEL BESIDE IT.
 * The Weekly Reflection arrives on its own for a member on the 24 week
 * program, from her Friday to her Sunday night. This button is the other
 * way in: a coach sending THIS week's reflection to any client on their
 * caseload, on any day, whatever plan she is on. It only ever adds. It
 * cannot take the automatic Friday away from a program member, and it
 * cannot produce a second copy for one, because an assignment names the
 * same week her plan would have named.
 *
 * FOUR STATES, SAID AS FOUR DIFFERENT THINGS, because a coach reading the
 * wrong one would either send something twice or think they had sent
 * something they had not: already finished this week, already assigned,
 * already open to her because of her plan, or nothing yet and here is the
 * button.
 *
 * Two genuinely different empty states, said differently: a client who is
 * not on the program tier is not somebody who has skipped their
 * reflections, and a coach reading "nothing yet" about a member who was
 * never offered it would draw the wrong conclusion.
 *
 * THE STATUS LINE IS THE THIRD THING THIS PANEL COULD NOT SAY. Completed
 * answers alone left "they saw it and skipped it" and "they never opened
 * the app" looking identical, which are opposite facts. The line above the
 * answers reports this week from a delivery receipt
 * (member_weekly_reflection_deliveries, migration 191) and the completion,
 * and it is honest about the case where there is simply no record. It
 * arrives already written, from the server, because its day names have to
 * be read in the MEMBER's timezone: formatting them here would format them
 * in the coach's, and differently in the two render passes.
 *
 * The week chips below it are unchanged.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { NotebookPen } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { WeeklyReflectionRecapBody } from '@/components/weekly-reflection/WeeklyReflectionRecapBody';
import {
  WEEKLY_REFLECTION_LABEL,
  REFLECTION_ANSWERS_HEADING,
} from '@/lib/weekly-reflection/copy';
import {
  WEEKLY_REFLECTION_QUESTIONS,
  weekOverallLabel,
} from '@/lib/weekly-reflection/questions';
import {
  assignWeeklyReflectionAction,
  type CoachWeeklyReflection,
  type CoachWeeklyReflectionAssignState,
  type CoachWeeklyReflectionStatus,
} from '@/app/actions/weeklyReflection';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function weekLabel(weekStart: string): string {
  return `Week of ${formatDisplayDate(weekStart, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** The answer as the coach reads it. The scale answer is shown as its word and its number, because the word is what she picked and the number is what makes weeks comparable. */
function answerText(key: string, value: number | string): string {
  if (typeof value === 'number') {
    const label = weekOverallLabel(value);
    return label ? `${label} (${value} of 5)` : `${value} of 5`;
  }
  return value;
}

export function WeeklyReflectionPanel({
  clientId,
  reflections,
  hasProgramTier,
  status,
  assign,
}: {
  clientId: string;
  reflections: CoachWeeklyReflection[];
  hasProgramTier: boolean;
  /** Null when nothing opened this week for the client, so there is no delivery to report. */
  status: CoachWeeklyReflectionStatus | null;
  /** Null when this coach may not see this client at all. */
  assign: CoachWeeklyReflectionAssignState | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(
    reflections[0]?.weekStart ?? null
  );
  const selected = reflections.find((row) => row.weekStart === selectedWeek) ?? null;

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await assignWeeklyReflectionAction(clientId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <NotebookPen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{WEEKLY_REFLECTION_LABEL}</p>
      </div>

      {status && (
        <p
          data-testid="weekly-reflection-status-line"
          className="mt-3 text-sm font-medium text-[#1B3A2D]"
        >
          {status.line}
        </p>
      )}

      {assign && <AssignThisWeek assign={assign} isPending={isPending} error={error} onSend={send} />}

      {!hasProgramTier && reflections.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">
          Not on the 24 week program, so this does not open on its own. Send it above and they get
          this week&apos;s on their next app open.
        </p>
      ) : reflections.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">
          On the program, no reflection completed yet. It opens every Friday and closes Sunday
          night.
        </p>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            {reflections.map((row) => {
              const active = row.weekStart === selectedWeek;
              return (
                <button
                  key={row.weekStart}
                  type="button"
                  onClick={() => setSelectedWeek(row.weekStart)}
                  aria-pressed={active}
                  className={`mef-focus-ring mef-press rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-[#1B3A2D] text-[#F5F0E4]'
                      : 'bg-[#F3F6F4] text-[#1B3A2D] hover:bg-[#E7EDE9]'
                  }`}
                >
                  {weekLabel(row.weekStart)}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  The week Root showed them
                </p>
                <div className="mt-2">
                  {selected.recap ? (
                    <WeeklyReflectionRecapBody recap={selected.recap} tone="light" />
                  ) : (
                    <p className="text-sm text-[#6B7A72]">
                      The stored recap for this week could not be read.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  {REFLECTION_ANSWERS_HEADING}
                </p>
                {selected.answers ? (
                  <dl className="mt-2 space-y-4">
                    {WEEKLY_REFLECTION_QUESTIONS.map((question) => (
                      <div key={question.key}>
                        <dt className="text-sm font-medium text-[#1B3A2D]">{question.prompt}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#3F5B50]">
                          {answerText(question.key, selected.answers![question.key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-[#6B7A72]">
                    The stored answers for this week could not be read.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The four things this week can be, and the one button.
 *
 * The order is the order a coach needs: what already happened first, what
 * they can do about it last. A finished week and an assigned week both
 * close the question, so neither shows a button at all rather than showing
 * a disabled one nobody can act on. A week her plan is already opening
 * says so plainly, because assigning it would change nothing she can see
 * and a button that does nothing is worse than no button.
 *
 * NO EM DASHES.
 */
function AssignThisWeek({
  assign,
  isPending,
  error,
  onSend,
}: {
  assign: CoachWeeklyReflectionAssignState;
  isPending: boolean;
  error: string | null;
  onSend: () => void;
}) {
  const weekName = formatDisplayDate(assign.weekStart, { month: 'short', day: 'numeric' });

  if (assign.completed) {
    return (
      <p data-testid="weekly-reflection-assign-state" className="mt-3 text-sm text-[#6B7A72]">
        {`They have finished the week of ${weekName}. The next one is a new week.`}
      </p>
    );
  }

  if (assign.assignedAt) {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled
          data-testid="weekly-reflection-assign-state"
          className="rounded-full bg-[#F3F6F4] px-4 py-2 text-xs font-semibold text-[#6B7A72]"
        >
          Assigned
        </button>
        <p className="mt-2 text-xs text-[#6B7A72]">
          {`Sent for the week of ${weekName}. They can only be sent one reflection a week.`}
        </p>
      </div>
    );
  }

  if (assign.automaticallyOffered) {
    return (
      <p data-testid="weekly-reflection-assign-state" className="mt-3 text-sm text-[#6B7A72]">
        On the program, so this week is already open to them until Sunday night. Nothing to send.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onSend}
        disabled={isPending}
        data-testid="weekly-reflection-assign-state"
        className="mef-focus-ring mef-press rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
      >
        {isPending ? 'Sending' : `Assign ${WEEKLY_REFLECTION_LABEL}`}
      </button>
      <p className="mt-2 text-xs text-[#6B7A72]">
        {`Opens the week of ${weekName} for them. It reaches them the next time they open the app.`}
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
