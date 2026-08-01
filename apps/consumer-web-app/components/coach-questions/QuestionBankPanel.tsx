'use client';

/**
 * Coach Question Bank — the primary reading surface for all 88
 * driver_probe_questions rows (task's own framing: "treat it as a
 * reading surface first"). Grouped by driver, filterable, with the
 * fixed core shown separately as read-only/protected (it isn't even a
 * row in this table — FIXED_CORE_QUESTION_KEYS is a hardcoded constant
 * check-in forms read directly, per lib/daily-checkin-adaptive/constants.ts).
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Plus } from 'lucide-react';
import type { Driver, DriverDomain } from '@/lib/driver-library/types';
import type { QuestionWithStats } from '@/lib/driver-probe-admin/types';
import { createQuestionAction } from '@/app/actions/driverProbeAdmin';
import { QuestionEditorForm } from './QuestionEditorForm';
import { QuestionRow } from './QuestionRow';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** Not a driver_probe_questions row — a hardcoded constant every check-in reads directly (lib/daily-checkin-adaptive/constants.ts). Shown here read-only so a coach can see the full daily question set in one place without being able to touch what buildProbeBank's own regression test protects. */
const PROTECTED_CORE_QUESTIONS = [
  { key: 'checkin.mood', prompt: 'How are you feeling emotionally this morning?' },
  { key: 'checkin.energy', prompt: 'How energized do you feel this morning?' },
  { key: 'checkin.stress', prompt: 'How much stress are you carrying as you wake up?' },
  { key: 'checkin.sleep_quality', prompt: 'How restorative was your sleep?' },
  { key: 'checkin.sleep_duration', prompt: 'About how many hours did you sleep?' },
  { key: 'checkin.pain', prompt: 'Are you noticing any pain or physical discomfort?' },
];

type StatusFilter = 'all' | 'active' | 'retired';
type AskedFilter = 'all' | 'never' | 'asked';
type SortBy = 'driver' | 'least_asked';

export function QuestionBankPanel({
  initialQuestions,
  drivers,
  domains,
}: {
  initialQuestions: QuestionWithStats[];
  drivers: Driver[];
  domains: DriverDomain[];
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [driverFilter, setDriverFilter] = useState('all');
  const [screenFilter, setScreenFilter] = useState<'all' | 'morning' | 'evening'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [askedFilter, setAskedFilter] = useState<AskedFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('driver');
  const [showRetired, setShowRetired] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');

  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const domainsByKey = useMemo(() => new Map(domains.map((d) => [d.key, d])), [domains]);

  const filtered = questions.filter((q) => {
    if (driverFilter !== 'all' && q.driverId !== driverFilter) return false;
    if (screenFilter !== 'all' && q.screen !== screenFilter) return false;
    if (askedFilter === 'never' && q.askedCount !== null && q.askedCount > 0) return false;
    if (askedFilter === 'asked' && (q.askedCount === null || q.askedCount === 0)) return false;
    return true;
  });

  const activeQuestions = filtered.filter((q) => q.active);
  const retiredQuestions = filtered.filter((q) => !q.active);

  const visibleActive =
    statusFilter === 'retired' ? [] : sortQuestions(activeQuestions, sortBy);
  const visibleRetired =
    statusFilter === 'active' ? [] : sortQuestions(retiredQuestions, sortBy);

  function sortQuestions(list: QuestionWithStats[], by: SortBy): QuestionWithStats[] {
    if (by === 'least_asked') {
      return [...list].sort((a, b) => (a.askedCount ?? -1) - (b.askedCount ?? -1));
    }
    return [...list].sort((a, b) => {
      const driverA = a.driverId ? driversById.get(a.driverId) : null;
      const driverB = b.driverId ? driversById.get(b.driverId) : null;
      const domainA = driverA ? (domainsByKey.get(driverA.domainKey)?.sortOrder ?? 999) : 999;
      const domainB = driverB ? (domainsByKey.get(driverB.domainKey)?.sortOrder ?? 999) : 999;
      if (domainA !== domainB) return domainA - domainB;
      const orderA = driverA?.sortOrder ?? 999;
      const orderB = driverB?.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.questionKey.localeCompare(b.questionKey);
    });
  }

  function groupByDriver(list: QuestionWithStats[]): { driver: Driver | null; questions: QuestionWithStats[] }[] {
    const groups = new Map<string, QuestionWithStats[]>();
    for (const q of list) {
      const key = q.driverId ?? '__followups__';
      groups.set(key, [...(groups.get(key) ?? []), q]);
    }
    const entries = [...groups.entries()].map(([key, qs]) => ({
      driver: key === '__followups__' ? null : (driversById.get(key) ?? null),
      questions: qs,
    }));
    // Follow-ups group (no driver) always last.
    return entries.sort((a, b) => {
      if (a.driver === null) return 1;
      if (b.driver === null) return -1;
      return 0;
    });
  }

  function replaceQuestion(updated: QuestionWithStats) {
    setQuestions((prev) => prev.map((q) => (q.questionKey === updated.questionKey ? updated : q)));
  }

  function addReplacementQuestion(retiredOld: QuestionWithStats, replacement: QuestionWithStats) {
    setQuestions((prev) => [
      ...prev.map((q) => (q.questionKey === retiredOld.questionKey ? retiredOld : q)),
      replacement,
    ]);
  }

  const activeGroups = groupByDriver(visibleActive);
  const retiredGroups = groupByDriver(visibleRetired);
  const neverAskedCount = questions.filter((q) => q.askedCount === 0 && q.active).length;

  return (
    <div className="space-y-5">
      {/* -------------------- Protected core -------------------- */}
      <section className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Lock className="h-4 w-4" strokeWidth={1.75} />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Protected core questions
          </p>
        </div>
        <p className="mt-1 text-xs text-[#6B7A72]">
          Asked every single day, never rotated. These aren&apos;t editable here: changing them
          risks breaking the Morning Readiness score and other features that depend on them
          existing exactly as they are.
        </p>
        <div className="mt-3 divide-y divide-[#1B3A2D]/5">
          {PROTECTED_CORE_QUESTIONS.map((q) => (
            <div key={q.key} className="flex items-center justify-between gap-3 py-2.5">
              <p className="text-sm text-[#1B3A2D]">{q.prompt}</p>
              <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#6B7A72]">
                Protected
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------- Add question -------------------- */}
      <section className={`${CARD} p-6`}>
        <button
          type="button"
          onClick={() => setShowCreate((prev) => !prev)}
          className="flex items-center gap-2 text-sm font-semibold text-[#1B3A2D]"
        >
          <Plus className="h-4 w-4" /> Add a question
        </button>
        {showCreate && (
          <div className="mt-4">
            <QuestionEditorForm
              mode="create"
              initial={{
                prompt: '',
                driverId: '',
                responseType: 'single_select',
                options: [],
                screen: 'morning',
              }}
              drivers={drivers}
              onCancel={() => setShowCreate(false)}
              onSubmit={async (input) => {
                setCreateError('');
                const result = await createQuestionAction(input);
                if (!result.error) {
                  setQuestions((prev) => [
                    ...prev,
                    {
                      questionKey: input.questionKey,
                      driverId: input.driverId,
                      prompt: input.prompt,
                      responseType: input.responseType,
                      options: input.options,
                      storage: 'probe_answer',
                      dailyCheckinsColumn: null,
                      wearableMetricCode: null,
                      requires: [],
                      excludes: [],
                      priority: 0,
                      active: true,
                      screen: input.screen,
                      displayStyle: null,
                      askedCount: 0,
                      answeredCount: 0,
                    },
                  ]);
                  setShowCreate(false);
                }
                return result;
              }}
            />
            {createError && <p className="mt-2 text-sm text-red-700">{createError}</p>}
          </div>
        )}
      </section>

      {/* -------------------- Filters -------------------- */}
      <section className={`${CARD} p-6`}>
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label="Driver"
            value={driverFilter}
            onChange={setDriverFilter}
            options={[
              { value: 'all', label: 'All drivers' },
              ...drivers.map((d) => ({ value: d.id, label: `${d.id}: ${d.label}` })),
            ]}
          />
          <FilterSelect
            label="Screen"
            value={screenFilter}
            onChange={(v) => setScreenFilter(v as typeof screenFilter)}
            options={[
              { value: 'all', label: 'Morning + Evening' },
              { value: 'morning', label: 'Morning only' },
              { value: 'evening', label: 'Evening only' },
            ]}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { value: 'all', label: 'Active + Retired' },
              { value: 'active', label: 'Active only' },
              { value: 'retired', label: 'Retired only' },
            ]}
          />
          <FilterSelect
            label="Asked?"
            value={askedFilter}
            onChange={(v) => setAskedFilter(v as AskedFilter)}
            options={[
              { value: 'all', label: 'Any' },
              { value: 'never', label: `Never asked (${neverAskedCount})` },
              { value: 'asked', label: 'Has been asked' },
            ]}
          />
          <FilterSelect
            label="Sort"
            value={sortBy}
            onChange={(v) => setSortBy(v as SortBy)}
            options={[
              { value: 'driver', label: 'By driver' },
              { value: 'least_asked', label: 'Least asked first' },
            ]}
          />
        </div>
      </section>

      {/* -------------------- Active questions, grouped by driver -------------------- */}
      {activeGroups.map((group) => (
        <section key={group.driver?.id ?? 'followups'} className={`${CARD} p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            {group.driver ? `${group.driver.id}: ${group.driver.label}` : 'Follow-up questions'}
          </p>
          {!group.driver && (
            <p className="mt-1 text-xs text-[#6B7A72]">
              Shown only after a member answers a specific earlier question this same check-in,
              not part of the daily rotation.
            </p>
          )}
          <div>
            {group.questions.map((question) => (
              <QuestionRow
                key={question.questionKey}
                question={question}
                drivers={drivers}
                onChanged={replaceQuestion}
                onReplaced={addReplacementQuestion}
              />
            ))}
          </div>
        </section>
      ))}

      {activeGroups.length === 0 && statusFilter !== 'retired' && (
        <div className={`${CARD} p-6`}>
          <p className="text-sm text-[#6B7A72]">No questions match these filters.</p>
        </div>
      )}

      {/* -------------------- Retired, de-emphasized -------------------- */}
      {retiredGroups.length > 0 && (
        <section className={`${CARD} p-6 opacity-70`}>
          <button
            type="button"
            onClick={() => setShowRetired((prev) => !prev)}
            className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wider text-[#6B7A72]"
          >
            <span>Retired ({visibleRetired.length})</span>
            {showRetired ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showRetired &&
            retiredGroups.map((group) => (
              <div key={group.driver?.id ?? 'followups'} className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]/80">
                  {group.driver ? `${group.driver.id}: ${group.driver.label}` : 'Follow-up questions'}
                </p>
                {group.questions.map((question) => (
                  <QuestionRow
                    key={question.questionKey}
                    question={question}
                    drivers={drivers}
                    onChanged={replaceQuestion}
                    onReplaced={addReplacementQuestion}
                  />
                ))}
              </div>
            ))}
        </section>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="text-xs font-medium text-[#6B7A72]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block rounded-xl border border-[#1B3A2D]/10 px-2.5 py-1.5 text-xs text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
