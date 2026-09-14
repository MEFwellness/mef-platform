'use client';

/**
 * The coach's Rooted Reset Fuel Pattern Assessment card.
 *
 * =====================================================================
 * HE SEES WHAT SHE NEVER DOES, AND THE ORDER SAYS WHY HE WOULD OPEN IT.
 * =====================================================================
 *
 *   1. The pattern and how sure the instrument is about it.
 *   2. The three raw scores, which are what that confidence is read from.
 *   3. The digestive discomfort signal, when it is there, before anything
 *      else she said, because it is the one thing on this card that might
 *      change how he opens a conversation.
 *   4. Her response tendencies, in plain language.
 *   5. Where the instrument got no reading, question by question.
 *   6. Her vitality answer, exactly as she gave it and unread.
 *   7. Pattern over time, when there is more than one sitting.
 *   8. Her meal preferences: what she has told her meal cards she does
 *      not eat, what she rejected and what she kept.
 *   9. Her Primal Pattern history, untouched, so the nutrition record on
 *      this page is one record rather than two.
 *
 * THE MEAL BLOCK IS NOT PER SITTING. Everything above it belongs to one
 * reading taken on one day, and the sitting chips at the top switch
 * between them. A standing preference is a fact about her that outlives
 * every retake, so it sits below the sittings rather than inside one, and
 * it does not move when he changes the chip.
 *
 * IT IS A READING, NEVER A DIAGNOSIS. The discomfort flag is printed with
 * the sentence that says it was never scored and did not move the
 * pattern. The vitality answer is printed with no interpretation at all.
 * Nothing on this card names a condition.
 *
 * READ ONLY. There is no Assign control, because this assessment is not
 * coach assigned: it opens on the monthly plan and she starts it herself.
 * Nothing on this card writes anything.
 *
 * Every row was fetched on the server by getClientFuelPatternPanelAction,
 * which is where the coach check and the test-account exclusion live.
 */

import { useState } from 'react';
import { ChevronDown, Utensils } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { FPA_LABEL } from '@/lib/fuel-pattern/constants';
import type { CoachFuelPatternPanelState } from '@/app/actions/fuelPatternCoach';
import type { FpaCoachMealReading } from '@/lib/fuel-pattern/meals/coachView';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const SUB_HEADER = 'text-xs font-semibold uppercase tracking-wider text-[#6B7A72]';

function sittingDate(iso: string): string {
  return formatDisplayDate(iso.slice(0, 10), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function FuelPatternPanel({ state }: { state: CoachFuelPatternPanelState }) {
  const [selectedId, setSelectedId] = useState<string | null>(state.sittings[0]?.id ?? null);
  const selected = state.sittings.find((s) => s.id === selectedId) ?? state.sittings[0] ?? null;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Utensils className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{FPA_LABEL}</p>
      </div>

      {!selected ? (
        <p className="mt-3 text-sm text-[#6B7A72]">Not completed yet.</p>
      ) : (
        <>
          {state.sittings.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {state.sittings.map((sitting) => {
                const active = sitting.id === selected.id;
                return (
                  <button
                    key={sitting.id}
                    type="button"
                    onClick={() => setSelectedId(sitting.id)}
                    aria-pressed={active}
                    className={`mef-focus-ring mef-press rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-[#1B3A2D] text-[#F5F0E4]'
                        : 'bg-[#F3F6F4] text-[#1B3A2D] hover:bg-[#E7EDE9]'
                    }`}
                  >
                    {sittingDate(sitting.completedAt)}
                  </button>
                );
              })}
            </div>
          )}

          {/* 1 and 2. The reading, and the numbers it came from. */}
          <div className="mt-4 rounded-2xl border border-[#C4A050]/40 bg-[#FDF9EF] p-4">
            <p className={SUB_HEADER}>Pattern</p>
            <p className="mt-1 font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-tight text-[#1B3A2D]">
              {selected.reading.patternLabel}
            </p>
            <p className="mt-1 text-sm text-[#3F5B50]">
              Confidence: {selected.reading.confidenceLabel}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              {(
                [
                  ['Protein', selected.reading.scores.protein],
                  ['Balanced', selected.reading.scores.balanced],
                  ['Carb', selected.reading.scores.carb],
                ] as const
              ).map(([name, score]) => (
                <div key={name} className="rounded-xl bg-white/70 px-3 py-2.5 text-center">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
                    {name}
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold text-[#1B3A2D]">{score}</dd>
                </div>
              ))}
            </dl>
            {/* The counted claim names the window it counted, always. */}
            <p className="mt-3 text-xs text-[#6B7A72]">
              {selected.reading.zeroWeightCount} of {selected.reading.scoredQuestionCount} scored
              questions carried no weight.
            </p>
          </div>

          {/* 3. The coaching signal, prominent and clearly not a finding. */}
          {selected.reading.digestiveDiscomfort && (
            <div className="mt-4 rounded-2xl border border-[#9B2C2C]/25 bg-[#FDECEC] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#9B2C2C]">
                Digestive discomfort
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#7A2E2E]">
                {selected.reading.digestiveDiscomfortNote}
              </p>
            </div>
          )}

          {/* 4. Tendencies. */}
          <div className="mt-5">
            <p className={SUB_HEADER}>Strongest response tendencies</p>
            {selected.reading.tendencyLines.length === 0 ? (
              <p className="mt-1.5 text-sm text-[#6B7A72]">None recorded on this sitting.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {selected.reading.tendencyLines.map((line) => (
                  <li key={line} className="text-sm leading-relaxed text-[#3F5B50]">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 5. Where the instrument got no reading. */}
          <div className="mt-5">
            <p className={SUB_HEADER}>Ambiguous and mixed areas</p>
            {selected.reading.ambiguous.length === 0 ? (
              <p className="mt-1.5 text-sm text-[#6B7A72]">
                Every scored question carried a direction.
              </p>
            ) : (
              <dl className="mt-2 space-y-3">
                {selected.reading.ambiguous.map((item) => (
                  <div key={item.questionKey}>
                    <dt className="text-sm font-medium text-[#1B3A2D]">
                      Q{item.order}. {item.prompt}
                    </dt>
                    <dd className="mt-0.5 text-sm leading-relaxed text-[#3F5B50]">
                      {item.answer}
                      {item.kind === 'tendency' ? ' (a tendency, not a direction)' : ''}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* 6. Her own answer, unread and uninterpreted. */}
          <div className="mt-5">
            <p className={SUB_HEADER}>Physical vitality, as she answered it</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#3F5B50]">
              {selected.reading.vitalityLine}
            </p>
          </div>
        </>
      )}

      {/* 7. Pattern over time. Only when there is a second sitting to compare. */}
      {state.sittings.length > 1 && (
        <div className="mt-6 border-t border-[#1B3A2D]/8 pt-5">
          <p className={SUB_HEADER}>Pattern over time</p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {state.sittings.map((sitting) => (
              <li key={sitting.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-sm text-[#6B7A72]">{sittingDate(sitting.completedAt)}</span>
                <span className="text-sm font-medium text-[#1B3A2D]">
                  {sitting.reading.patternLabel}
                  <span className="ml-2 font-normal text-[#6B7A72]">
                    {sitting.reading.confidenceLabel}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 8. Her meal preferences, as she recorded them on her own cards. */}
      <MealPreferencesBlock meals={state.meals} />

      {/* 9. The record that came before, exactly as it was stored. */}
      {state.primalSittings.length > 0 && (
        <div className="mt-6 border-t border-[#1B3A2D]/8 pt-5">
          <p className={SUB_HEADER}>Before this instrument</p>
          <p className="mt-1.5 text-xs leading-relaxed text-[#6B7A72]">
            Her Primal Pattern Diet Type sittings, exactly as they were stored. That questionnaire
            is retired and these readings are not converted into a fuel pattern, because the two
            asked different questions.
          </p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {state.primalSittings.map((sitting) => (
              <li key={sitting.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-sm text-[#6B7A72]">{sittingDate(sitting.completedAt)}</span>
                <span className="text-sm font-medium text-[#1B3A2D]">{sitting.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * MEAL PREFERENCES.
 *
 * READ ONLY, AND IT INTERPRETS NOTHING. An allergy is marked as an
 * allergy because she said so, and that is the whole of the difference
 * between the two rows. There is no severity here and no advice, and
 * nothing in this block names a condition.
 *
 * THE SAVED MEALS ARE A COUNT THAT OPENS. He usually wants to know
 * whether she is saving anything at all, and only sometimes which ones,
 * so the number is the headline and the names are one tap underneath it.
 */
function MealPreferencesBlock({ meals }: { meals: FpaCoachMealReading }) {
  const [showSaved, setShowSaved] = useState(false);

  const nothingRecorded =
    meals.preferences.length === 0 && meals.rejections.length === 0 && meals.savedCount === 0;

  return (
    <div className="mt-6 border-t border-[#1B3A2D]/8 pt-5">
      <p className={SUB_HEADER}>Meal preferences</p>

      {nothingRecorded ? (
        <p className="mt-1.5 text-sm text-[#6B7A72]">
          Nothing recorded on her meal cards yet.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-[#9AA79F]">
              Standing preferences
            </p>
            {meals.preferences.length === 0 ? (
              <p className="mt-1.5 text-sm text-[#6B7A72]">None recorded.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {meals.preferences.map((preference) => (
                  <li
                    key={preference.key}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      preference.isAllergy
                        ? 'border border-[#9B2C2C]/25 bg-[#FDECEC] text-[#7A2E2E]'
                        : 'bg-[#F3F6F4] text-[#1B3A2D]'
                    }`}
                  >
                    {preference.label}
                    {preference.isAllergy ? ' (allergy)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#9AA79F]">
              Meals she declined
            </p>
            {meals.rejections.length === 0 ? (
              <p className="mt-1.5 text-sm text-[#6B7A72]">None.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
                {meals.rejections.map((rejection) => (
                  <li key={rejection.mealId} className="py-2.5">
                    <p className="text-sm font-medium text-[#1B3A2D]">
                      {rejection.mealName}
                      {rejection.mealTypeLabel ? (
                        <span className="ml-2 text-xs font-normal uppercase tracking-wider text-[#9AA79F]">
                          {rejection.mealTypeLabel}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-[#6B7A72]">
                      {rejection.reasonLabel}
                      {rejection.note ? `: ${rejection.note}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            {/* A count with nothing behind it is a line, not a control. The
                disclosure exists only when there is something to disclose,
                which also keeps this read-only card free of a button that
                does nothing. */}
            {meals.savedCount === 0 ? (
              <p className="rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm font-medium text-[#6B7A72]">
                Saved meals: none
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setShowSaved((open) => !open)}
                aria-expanded={showSaved}
                className="mef-focus-ring mef-press flex w-full items-center justify-between gap-3 rounded-2xl bg-[#F3F6F4] px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-[#1B3A2D]">
                  Saved meals: {meals.savedCount}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-[#6B7A72] transition-transform ${
                    showSaved ? 'rotate-180' : ''
                  }`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            )}
            {showSaved && meals.savedCount > 0 && (
              <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
                {meals.saved.map((meal) => (
                  <li key={meal.mealId} className="flex items-baseline justify-between gap-3 py-2.5">
                    <span className="text-sm text-[#1B3A2D]">{meal.mealName}</span>
                    <span className="shrink-0 text-xs text-[#6B7A72]">
                      {meal.mealTypeLabel ? `${meal.mealTypeLabel}, ` : ''}
                      {meal.patternLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
