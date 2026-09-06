'use client';

/**
 * Coach Question Bank — the primary reading surface for all 88
 * driver_probe_questions rows (task's own framing: "treat it as a
 * reading surface first"). Grouped by driver, filterable, with the
 * fixed core shown separately as read-only/protected (it isn't even a
 * row in this table — FIXED_CORE_QUESTION_KEYS is a hardcoded constant
 * check-in forms read directly, per lib/daily-checkin-adaptive/constants.ts).
 *
 * WHAT THE COACH SIDE EXPERIENCE PASS CHANGED (2026-09-06). This was the
 * worst screen on the staff side by a wide margin: 25,231px on a 390px
 * phone, which is thirty full screens of scrolling, with all 88 questions
 * laid out at once across roughly twenty driver cards. Finding one
 * question meant knowing its driver and then scrolling to it, because the
 * five dropdowns could narrow the list but nothing could search it.
 *
 * Three changes, all presentation:
 *   1. A PINNED FIELD that stays on screen while the page scrolls, and
 *      matches a question's prompt, its key, its options and its driver's
 *      name. It uses `textMatchesSearch` from the assignable catalog, the
 *      same function the client detail page's own pinned search calls, so
 *      two staff fields cannot disagree about what a match is.
 *   2. THE DRIVER GROUPS FOLD, and start folded, rendering no rows while
 *      they are shut. The page opens on its groups rather than on
 *      everything inside them. A group's header carries the count, so a
 *      folded group still answers "how many are in here".
 *   3. TYPING OPENS WHAT IT FINDS. While the field has anything in it
 *      every group holding a match is forced open, so a search never
 *      returns a list of shut doors. Clearing the field hands control
 *      back to whatever the coach had opened by hand.
 *
 * The protected core is folded for the same reason: six read-only rows a
 * coach cannot act on were the first thing above the work.
 *
 * NO DATA BEHAVIOUR CHANGED. Same rows, same filters, same sort, same
 * actions, same server calls.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Plus, Search } from 'lucide-react';
import { textMatchesSearch } from '@/lib/assignments/assignableCatalog';
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
  const [query, setQuery] = useState('');
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

  /**
   * Everything a coach might reasonably type to find one question: the
   * words she reads on the check-in, the key an engineer would quote, the
   * answer options, and the driver the question belongs to. An empty query
   * matches everything, which is what makes clearing the field restore the
   * list with no separate reset path.
   */
  function matchesQuery(q: QuestionWithStats): boolean {
    if (query.trim().length === 0) return true;
    const driver = q.driverId ? driversById.get(q.driverId) : null;
    const haystack = [
      q.prompt,
      q.questionKey,
      ...(q.options ?? []).map((option) =>
        typeof option === 'object' ? option.label : String(option)
      ),
      driver ? `${driver.id} ${driver.label}` : '',
    ];
    return haystack.some((text) => text && textMatchesSearch(text, query));
  }

  const searching = query.trim().length > 0;

  const filtered = questions.filter((q) => {
    if (driverFilter !== 'all' && q.driverId !== driverFilter) return false;
    if (screenFilter !== 'all' && q.screen !== screenFilter) return false;
    if (askedFilter === 'never' && q.askedCount !== null && q.askedCount > 0) return false;
    if (askedFilter === 'asked' && (q.askedCount === null || q.askedCount === 0)) return false;
    if (!matchesQuery(q)) return false;
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

  const totalActive = questions.filter((q) => q.active).length;
  const shownActive = visibleActive.length;

  return (
    <div className="space-y-5">
      {/*
        The field is pinned rather than placed, because the thing it is
        for is finding one question among eighty-eight: a search control
        that scrolls away is only usable from the top of the list it
        searches. Same geometry and same offsets as the client detail
        page's pinned field, so the two staff searches look like one
        control used twice.
      */}
      <div className="sticky top-0 z-30 -mx-5 bg-gradient-to-b from-[#EFF6F1] via-[#EFF6F1] to-[#EFF6F1]/95 px-5 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-10 md:px-10">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search questions, keys, answers or drivers"
            aria-label="Search questions, keys, answers or drivers"
            data-question-search="true"
            className="w-full rounded-full border border-[#1B3A2D]/10 bg-white py-3 pl-11 pr-4 text-sm text-[#1B3A2D] shadow-[0_2px_12px_-6px_rgba(27,58,45,0.25)] focus:border-[#C4A050] focus:outline-none"
          />
        </div>
        <p data-question-count className="mt-2 px-1 text-xs text-[#6B7A72]">
          {searching
            ? `${shownActive} of ${totalActive} active questions match "${query.trim()}".`
            : `${totalActive} active questions.`}
        </p>
      </div>

      {/* -------------------- Protected core -------------------- */}
      <FoldedCard
        title="Protected core questions"
        digest={`${PROTECTED_CORE_QUESTIONS.length} questions asked every day, read only.`}
        icon={<Lock className="h-4 w-4 shrink-0 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />}
      >
        <p className="text-xs text-[#6B7A72]">
          Asked every single day, never rotated. These aren&apos;t editable here: changing them
          risks breaking the Daily Reset score and other features that depend on them
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
      </FoldedCard>

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
      <FoldedCard
        title="Filters"
        digest={filterDigest({ driverFilter, screenFilter, statusFilter, askedFilter, sortBy })}
      >
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
      </FoldedCard>

      {/* -------------------- Active questions, grouped by driver -------------------- */}
      {activeGroups.map((group) => (
        <FoldedCard
          key={group.driver?.id ?? 'followups'}
          title={group.driver ? `${group.driver.id}: ${group.driver.label}` : 'Follow-up questions'}
          digest={
            group.driver
              ? questionCountLabel(group.questions.length)
              : `${questionCountLabel(group.questions.length)} Shown only after a member answers a specific earlier question this same check-in, not part of the daily rotation.`
          }
          forceOpen={searching}
        >
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
        </FoldedCard>
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

/** "12 questions." / "1 question." Never a bare number, because a folded header has to read as a sentence. */
function questionCountLabel(count: number): string {
  return `${count} question${count === 1 ? '' : 's'}.`;
}

/**
 * What the folded Filters header says, so a coach can tell at a glance
 * whether anything is narrowing the list underneath. A filter left on and
 * forgotten behind a fold would be the one way this change could mislead,
 * so the header names every filter that is not at its default.
 */
function filterDigest(state: {
  driverFilter: string;
  screenFilter: string;
  statusFilter: string;
  askedFilter: string;
  sortBy: string;
}): string {
  const active: string[] = [];
  if (state.driverFilter !== 'all') active.push('driver');
  if (state.screenFilter !== 'all') active.push('screen');
  if (state.statusFilter !== 'all') active.push('status');
  if (state.askedFilter !== 'all') active.push('asked');
  if (state.sortBy !== 'driver') active.push('sort');
  if (active.length === 0) return 'No filters applied, sorted by driver.';
  return `Filtering by ${active.join(', ')}.`;
}

/**
 * One folded group on this screen.
 *
 * It is a local component rather than components/staff/StaffCollapsible.tsx
 * for one reason: `forceOpen`. A search that finds a question inside a shut
 * group has to open that group, and a shared collapsible whose open state
 * is its own would hand back a list of closed doors. When `forceOpen` goes
 * false again the coach's own toggles are still there, because the manual
 * state was never overwritten, only overridden.
 */
function FoldedCard({
  title,
  digest,
  icon,
  forceOpen = false,
  children,
}: {
  title: string;
  digest?: string | undefined;
  icon?: React.ReactNode | undefined;
  forceOpen?: boolean | undefined;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const shown = forceOpen || open;
  return (
    <section className={CARD}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={shown}
        className="mef-focus-ring flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[28px] px-5 py-4 text-left"
      >
        <span className="flex min-w-0 items-start gap-2.5">
          {icon ? <span className="mt-0.5">{icon}</span> : null}
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-snug text-[#1B3A2D]">
              {title}
            </span>
            {digest ? (
              <span className="mt-0.5 block text-xs leading-relaxed text-[#6B7A72]">{digest}</span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#6B7A72] transition-transform duration-200 ${
            shown ? 'rotate-180' : ''
          }`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {shown ? (
        <div className="border-t border-[#1B3A2D]/5 px-5 pb-5 pt-4">{children}</div>
      ) : null}
    </section>
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
