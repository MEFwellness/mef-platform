'use client';

/**
 * The Relationship Library's list view, and the one place the editor, the
 * version history and the toggles are reached from.
 *
 * THE LIBRARY IS EMPTY UNTIL SHE FILLS IT. The empty state says that
 * plainly rather than offering to generate anything, because nothing in
 * this app may invent a whole-body relationship. The single record it
 * ships with is flagged as an example, is inactive, and wears an Example
 * chip on its row.
 *
 * SEARCH, ACTIVE FILTER, CATEGORY FILTER, all three run in the browser
 * over the list the page already loaded, because the library is a few
 * dozen definitions rather than a feed. The filtering itself lives in
 * lib/cross-system-relationships/filters.ts so the category chip and the
 * row's own body systems line cannot come to disagree about which
 * categories a pattern names.
 *
 * NOTHING HERE MATCHES ANYTHING. No member, no signal row, no score. This
 * screen reads and writes definitions.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, History, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  deleteRelationshipAction,
  duplicateRelationshipAction,
  getRelationshipAction,
  setRelationshipActiveAction,
} from '@/app/actions/crossSystemRelationships';
import { REF_KIND_LABELS, ROLE_LABELS } from '@/lib/cross-system-relationships/constants';
import {
  categoriesOf,
  EMPTY_FILTERS,
  filterRelationships,
  type RelationshipFilters,
} from '@/lib/cross-system-relationships/filters';
import type {
  RelationshipDetail,
  RelationshipSummary,
} from '@/lib/cross-system-relationships/types';
import type {
  SignalBodyArea,
  SignalCategory,
  StandardizedSignalName,
} from '@/lib/cross-system-signals/types';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { RelationshipEditor } from './RelationshipEditor';
import { RelationshipVersionHistory } from './RelationshipVersionHistory';
import {
  CARD,
  CHIP,
  CHIP_OFF,
  CHIP_ON,
  FIELD,
  LABEL,
  OUTLINE_BUTTON,
  PANEL,
  PRIMARY_BUTTON,
} from './styles';

type Props = {
  summaries: RelationshipSummary[];
  categories: SignalCategory[];
  bodyAreas: SignalBodyArea[];
  signalNames: StandardizedSignalName[];
};

type OpenEditor =
  | { mode: 'create' }
  | { mode: 'edit'; detail: RelationshipDetail }
  | null;

const STATUS_OPTIONS: { key: RelationshipFilters['status']; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

export function RelationshipLibraryPanel({
  summaries,
  categories,
  bodyAreas,
  signalNames,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<RelationshipFilters>(EMPTY_FILTERS);
  const [editor, setEditor] = useState<OpenEditor>(null);
  const [historyFor, setHistoryFor] = useState<RelationshipDetail | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, startAction] = useTransition();

  // signal_slug to category_key, so the category filter and the row's own
  // body systems line read one source.
  const lookup = useMemo(
    () => new Map(signalNames.map((name) => [name.signalSlug, name.categoryKey])),
    [signalNames]
  );

  const categoryName = useMemo(
    () => new Map(categories.map((category) => [category.categoryKey, category.displayName])),
    [categories]
  );

  const visible = useMemo(
    () => filterRelationships(summaries, filters, lookup),
    [summaries, filters, lookup]
  );

  function openEditor(relationshipId: string) {
    setError(null);
    startAction(async () => {
      const detail = await getRelationshipAction(relationshipId);
      if (!detail) {
        setError('Could not open that pattern. Please try again.');
        return;
      }
      setHistoryFor(null);
      setEditor({ mode: 'edit', detail });
    });
  }

  function openHistory(relationshipId: string) {
    setError(null);
    startAction(async () => {
      const detail = await getRelationshipAction(relationshipId);
      if (!detail) {
        setError('Could not open that version history. Please try again.');
        return;
      }
      setEditor(null);
      setHistoryFor(detail);
    });
  }

  function toggleActive(relationshipId: string, next: boolean) {
    setError(null);
    startAction(async () => {
      const result = await setRelationshipActiveAction(relationshipId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function duplicate(relationshipId: string) {
    setError(null);
    startAction(async () => {
      const result = await duplicateRelationshipAction(relationshipId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(relationshipId: string) {
    setError(null);
    startAction(async () => {
      const result = await deleteRelationshipAction(relationshipId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmingDelete(null);
      router.refresh();
    });
  }

  if (editor) {
    return (
      <RelationshipEditor
        relationshipId={editor.mode === 'edit' ? editor.detail.head.id : null}
        source={editor.mode === 'edit' ? editor.detail.current : null}
        categories={categories}
        bodyAreas={bodyAreas}
        signalNames={signalNames}
        onSaved={() => {
          setEditor(null);
          router.refresh();
        }}
        onCancel={() => setEditor(null)}
      />
    );
  }

  if (historyFor) {
    return (
      <div className={PANEL}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              Version history
            </p>
            <p className="mt-1 text-[15px] text-[#1B3A2D]">{historyFor.current.patternName}</p>
          </div>
          <button type="button" onClick={() => setHistoryFor(null)} className={OUTLINE_BUTTON}>
            Back to the library
          </button>
        </div>
        <div className="mt-4">
          <RelationshipVersionHistory history={historyFor.history} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Search and the two filters. */}
      <div className={`${PANEL}`}>
        <label htmlFor="relationship-search" className={LABEL}>
          Search patterns
        </label>
        <div className="relative mt-1.5">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            id="relationship-search"
            type="search"
            autoComplete="off"
            value={filters.query}
            placeholder="A pattern name, or anything it names"
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
            className={`${FIELD} pl-9`}
          />
        </div>

        <p className={`${LABEL} mt-4`}>Status</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filters.status === option.key}
              onClick={() => setFilters((current) => ({ ...current, status: option.key }))}
              className={`${CHIP} ${filters.status === option.key ? CHIP_ON : CHIP_OFF}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label htmlFor="category-filter" className={`${LABEL} mt-4`}>
          Body system
        </label>
        <select
          id="category-filter"
          value={filters.categoryKey ?? ''}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              categoryKey: event.target.value === '' ? null : event.target.value,
            }))
          }
          className={`${FIELD} mt-1.5 w-auto min-w-[12rem]`}
        >
          <option value="">Every body system</option>
          {categories.map((category) => (
            <option key={category.categoryKey} value={category.categoryKey}>
              {category.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-[#4F645A]">
          {visible.length} of {summaries.length} {summaries.length === 1 ? 'pattern' : 'patterns'}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditor({ mode: 'create' });
          }}
          className={PRIMARY_BUTTON}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          New pattern
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[#8C2F1F]" role="alert">
          {error}
        </p>
      ) : null}

      {summaries.length === 0 ? (
        <div className={`${CARD} mt-4 p-6`}>
          <p className="text-sm leading-relaxed text-[#3E5C46]">
            The library is empty. Whole-body patterns are yours to define, one at a time, from your
            own training. Nothing in this app writes one for you. Start with New pattern above.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className={`${CARD} mt-4 p-6`}>
          <p className="text-sm text-[#3E5C46]">No pattern matches those filters.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((summary) => {
            const systems = [...categoriesOf(summary, lookup)]
              .map((key) => categoryName.get(key) ?? key)
              .sort((a, b) => a.localeCompare(b));
            const counts = (['primary', 'related', 'support'] as const).map((role) => ({
              role,
              count: summary.current.components.filter((item) => item.role === role).length,
            }));

            return (
              <li key={summary.head.id} className={`${CARD} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-semibold leading-snug text-[#1B3A2D]">
                        {summary.current.patternName}
                      </h2>
                      {summary.head.isExample ? (
                        <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#3E5C46]">
                          Example
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                          summary.head.isActive
                            ? 'bg-[#1B3A2D] text-white'
                            : 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]'
                        }`}
                      >
                        {summary.head.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#6B7A72]">
                      Version {summary.head.currentVersion}, saved{' '}
                      {formatDisplayDate(summary.current.createdAt, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-[13px] text-[#3E5C46]">
                  {counts
                    .filter((entry) => entry.count > 0)
                    .map((entry) => `${entry.count} ${ROLE_LABELS[entry.role].toLowerCase()}`)
                    .join(', ') || 'No inputs yet'}
                  {'. At least '}
                  {summary.current.minSupportingSignals} supporting signals before it may surface.
                </p>

                {systems.length > 0 ? (
                  <p className="mt-1 text-[13px] text-[#6B7A72]">
                    Body systems: {systems.join(', ')}
                  </p>
                ) : null}

                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {summary.current.components.slice(0, 6).map((component) => (
                    <li
                      key={component.id}
                      className="rounded-full border border-[#1B3A2D]/10 bg-[#FAFAF8] px-2.5 py-1 text-[12px] text-[#3E5C46]"
                    >
                      {ROLE_LABELS[component.role]}: {component.refLabel}
                      <span className="text-[#6B7A72]">
                        {' '}
                        ({REF_KIND_LABELS[component.refKind]})
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => openEditor(summary.head.id)}
                    className={OUTLINE_BUTTON}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => openHistory(summary.head.id)}
                    className={OUTLINE_BUTTON}
                  >
                    <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Version history
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => duplicate(summary.head.id)}
                    className={OUTLINE_BUTTON}
                  >
                    <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => toggleActive(summary.head.id, !summary.head.isActive)}
                    className={OUTLINE_BUTTON}
                  >
                    {summary.head.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  {confirmingDelete === summary.head.id ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => remove(summary.head.id)}
                        className="mef-focus-ring inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#8C2F1F] px-4 text-sm font-medium text-white transition hover:brightness-110"
                      >
                        Delete it and every version
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(null)}
                        className={OUTLINE_BUTTON}
                      >
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setConfirmingDelete(summary.head.id)}
                      className={OUTLINE_BUTTON}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
