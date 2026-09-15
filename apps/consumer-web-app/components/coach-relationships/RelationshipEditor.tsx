'use client';

/**
 * The relationship editor. Four levels, clearly separated, plus the one
 * field that is hers alone.
 *
 *   1. OBSERVED INPUTS         what the pattern is made of. Any number of
 *                                signals, body systems and body areas, in
 *                                three roles.
 *   2. PATTERN COMPOSITION     the floor, and the thresholds that separate
 *                                one strength level from the next.
 *   3. POSSIBLE ASSOCIATION    the coach only explanation.
 *   4. COACHING CONSIDERATIONS one line each.
 *   plus EVIDENCE AND METHODOLOGY NOTES, which is private to her and is
 *   drawn nowhere outside this editor.
 *
 * THE PICKERS ARE THE SIGNAL LIBRARY'S OWN LISTS, handed down from the
 * page, which got them from loadSignalLibrary: the same call the ingestion
 * adapters and the Add Signal tool make. There is no second vocabulary.
 * A name the library has never held can be added from right here, through
 * the same insert-only door Add Signal uses.
 *
 * NOTHING IS HARD CODED TO A PAIRING. The form has no hip field and no
 * kidney field. Every input is a role, a vocabulary and a key, so a joint
 * to a system, a skin signal to digestion, a stress signal to a physical
 * symptom and five systems onto one symptom are all typed the same way.
 *
 * THE FORM DECIDES NOTHING THAT IS SAVED. It posts keys. Every label, the
 * version number, the pattern key and the active flag are resolved on the
 * server (app/actions/crossSystemRelationships.ts), so a hand built
 * request cannot write an input labelled one thing and pointing at
 * another.
 *
 * THE LANGUAGE WARNING NAMES, IT DOES NOT REFUSE. The coach is the author
 * of every word here and may have a reason to quote a phrase. What the
 * editor does is say which phrase it found and what this feature writes
 * instead. lib/cross-system-relationships/language.ts holds the list, and
 * the shipped strings are held to zero by the copy lint.
 */

import { useMemo, useState, useTransition } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import {
  addStandardizedSignalNameAction,
  createRelationshipAction,
  saveRelationshipVersionAction,
} from '@/app/actions/crossSystemRelationships';
import {
  CONSIDERATION_MAX_LENGTH,
  DEFAULT_STRENGTH_LEVELS,
  MAX_CONSIDERATIONS,
  MAX_STRENGTH_LEVELS,
  PATTERN_NAME_MAX_LENGTH,
  REF_KIND_LABELS,
  RELATIONSHIP_EVIDENCE_SECTION,
  RELATIONSHIP_FORM_SECTIONS,
  ROLE_LABELS,
} from '@/lib/cross-system-relationships/constants';
import {
  ASSOCIATION_VOCABULARY,
  bannedLanguageWarning,
  findBannedLanguage,
} from '@/lib/cross-system-relationships/language';
import type {
  RelationshipComponentRole,
  RelationshipDraft,
  RelationshipRefKind,
  RelationshipVersion,
} from '@/lib/cross-system-relationships/types';
import { SIDE_LABELS } from '@/lib/cross-system-signals/coachView';
import type {
  SignalBodyArea,
  SignalCategory,
  SignalSide,
  StandardizedSignalName,
} from '@/lib/cross-system-signals/types';
import {
  BLURB,
  CHIP,
  CHIP_OFF,
  CHIP_ON,
  FIELD,
  LABEL,
  OUTLINE_BUTTON,
  PANEL,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
  SECTION_TITLE,
  TEXTAREA,
} from './styles';

const ROLES: RelationshipComponentRole[] = ['primary', 'related', 'support'];
const SIDE_ORDER: SignalSide[] = ['left', 'right', 'both', 'not_applicable'];

/** One row of the form's input list. Everything optional is optional. */
type ComponentRow = {
  /** Local only, so a row can be removed without the list reindexing under the coach. */
  uid: string;
  role: RelationshipComponentRole;
  refKind: RelationshipRefKind;
  refKey: string;
  refLabel: string;
  side: SignalSide | null;
  valueLabel: string;
  minValueNumeric: string;
  sourceQuestionRef: string;
  sourceQuestionPrompt: string;
  note: string;
};

type LevelRow = {
  uid: string;
  levelKey: string;
  displayLabel: string;
  minSupportingSignals: string;
  minDistinctCategories: string;
  minRelatedSignals: string;
};

type Props = {
  /** Null for a brand new pattern. */
  relationshipId: string | null;
  /** The version the form opens on, for an edit. Null for a new pattern. */
  source: RelationshipVersion | null;
  categories: SignalCategory[];
  bodyAreas: SignalBodyArea[];
  signalNames: StandardizedSignalName[];
  onSaved: () => void;
  onCancel: () => void;
};

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `row-${uidCounter}`;
}

export function RelationshipEditor({
  relationshipId,
  source,
  categories,
  bodyAreas,
  signalNames,
  onSaved,
  onCancel,
}: Props) {
  const [names, setNames] = useState<StandardizedSignalName[]>(signalNames);

  const [patternName, setPatternName] = useState(source?.patternName ?? '');
  const [minSupporting, setMinSupporting] = useState(
    String(source?.minSupportingSignals ?? 2)
  );
  const [association, setAssociation] = useState(source?.possibleAssociationText ?? '');
  const [evidence, setEvidence] = useState(source?.evidenceNotes ?? '');
  const [changeSummary, setChangeSummary] = useState('');

  const [components, setComponents] = useState<ComponentRow[]>(() =>
    (source?.components ?? []).map((component) => ({
      uid: nextUid(),
      role: component.role,
      refKind: component.refKind,
      refKey: component.refKey,
      refLabel: component.refLabel,
      side: component.side,
      valueLabel: component.valueLabel ?? '',
      minValueNumeric:
        component.minValueNumeric === null ? '' : String(component.minValueNumeric),
      sourceQuestionRef: component.sourceQuestionRef ?? '',
      sourceQuestionPrompt: component.sourceQuestionPrompt ?? '',
      note: component.note ?? '',
    }))
  );

  const [levels, setLevels] = useState<LevelRow[]>(() =>
    (source?.strengthLevels ?? DEFAULT_STRENGTH_LEVELS).map((level) => ({
      uid: nextUid(),
      levelKey: level.levelKey,
      displayLabel: level.displayLabel,
      minSupportingSignals: String(level.minSupportingSignals),
      minDistinctCategories:
        level.minDistinctCategories === null ? '' : String(level.minDistinctCategories),
      minRelatedSignals:
        level.minRelatedSignals === null ? '' : String(level.minRelatedSignals),
    }))
  );

  const [considerations, setConsiderations] = useState<string[]>(() =>
    source ? source.considerations.map((item) => item.body) : ['']
  );

  // The add-an-input row, which is its own small form above the list.
  const [draftRole, setDraftRole] = useState<RelationshipComponentRole>('primary');
  const [categoryDraftKey, setCategoryDraftKey] = useState('');
  const [areaDraftKey, setAreaDraftKey] = useState('');
  const [signalQuery, setSignalQuery] = useState('');
  const [newNameCategory, setNewNameCategory] = useState(categories[0]?.categoryKey ?? '');
  const [addingName, startAddName] = useTransition();

  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  const signalMatches = useMemo(() => {
    const needle = signalQuery.trim().toLowerCase();
    if (needle.length === 0) return [];
    return names
      .filter(
        (name) =>
          name.displayName.toLowerCase().includes(needle) ||
          name.searchTerms.toLowerCase().includes(needle)
      )
      .slice(0, 12);
  }, [names, signalQuery]);

  const exactNameExists = useMemo(
    () =>
      names.some(
        (name) => name.displayName.toLowerCase() === signalQuery.trim().toLowerCase()
      ),
    [names, signalQuery]
  );

  const associationWarning = bannedLanguageWarning(findBannedLanguage(association));
  const considerationWarning = bannedLanguageWarning(
    findBannedLanguage(considerations.join(' '))
  );
  const nameWarning = bannedLanguageWarning(findBannedLanguage(patternName));

  function labelFor(kind: RelationshipRefKind, key: string): string {
    if (kind === 'signal') return names.find((n) => n.signalSlug === key)?.displayName ?? key;
    if (kind === 'category') {
      return categories.find((c) => c.categoryKey === key)?.displayName ?? key;
    }
    return bodyAreas.find((a) => a.areaKey === key)?.displayName ?? key;
  }

  function addComponent(kind: RelationshipRefKind, key: string) {
    if (!key) return;
    setComponents((current) => {
      const already = current.some(
        (row) => row.role === draftRole && row.refKind === kind && row.refKey === key
      );
      if (already) return current;
      return [
        ...current,
        {
          uid: nextUid(),
          role: draftRole,
          refKind: kind,
          refKey: key,
          refLabel: labelFor(kind, key),
          side: null,
          valueLabel: '',
          minValueNumeric: '',
          sourceQuestionRef: '',
          sourceQuestionPrompt: '',
          note: '',
        },
      ];
    });
    setSignalQuery('');
    setError(null);
  }

  function updateComponent(uid: string, patch: Partial<ComponentRow>) {
    setComponents((current) =>
      current.map((row) => (row.uid === uid ? { ...row, ...patch } : row))
    );
  }

  function removeComponent(uid: string) {
    setComponents((current) => current.filter((row) => row.uid !== uid));
  }

  function handleAddNewName() {
    const proposed = signalQuery.trim();
    if (proposed.length < 2 || !newNameCategory) return;
    startAddName(async () => {
      const result = await addStandardizedSignalNameAction(proposed, newNameCategory);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNames((current) =>
        current.some((name) => name.signalSlug === result.name.signalSlug)
          ? current
          : [...current, result.name].sort((a, b) => a.displayName.localeCompare(b.displayName))
      );
      addComponent('signal', result.name.signalSlug);
    });
  }

  function buildDraft(): RelationshipDraft {
    return {
      patternName,
      minSupportingSignals: Number(minSupporting) || 1,
      possibleAssociationText: association,
      evidenceNotes: evidence,
      changeSummary: relationshipId ? changeSummary : null,
      components: components.map((row) => ({
        role: row.role,
        refKind: row.refKind,
        refKey: row.refKey,
        side: row.side,
        valueKey: null,
        valueLabel: row.valueLabel,
        minValueNumeric: row.minValueNumeric === '' ? null : Number(row.minValueNumeric),
        sourceKey: null,
        sourceQuestionRef: row.sourceQuestionRef,
        sourceQuestionPrompt: row.sourceQuestionPrompt,
        note: row.note,
      })),
      strengthLevels: levels.map((level) => ({
        levelKey: level.levelKey,
        displayLabel: level.displayLabel,
        minSupportingSignals: Number(level.minSupportingSignals) || 1,
        minDistinctCategories:
          level.minDistinctCategories === '' ? null : Number(level.minDistinctCategories),
        minRelatedSignals:
          level.minRelatedSignals === '' ? null : Number(level.minRelatedSignals),
      })),
      considerations,
    };
  }

  function handleSave() {
    setError(null);
    const draft = buildDraft();
    startSave(async () => {
      const result = relationshipId
        ? await saveRelationshipVersionAction(relationshipId, draft)
        : await createRelationshipAction(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  const byRole = (role: RelationshipComponentRole) =>
    components.filter((row) => row.role === role);

  return (
    <div className={PANEL}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={SECTION_TITLE}>
            {relationshipId ? `Editing, saves as version ${(source?.versionNumber ?? 0) + 1}` : 'New pattern'}
          </p>
          <p className={BLURB}>
            {relationshipId
              ? 'Every edit is kept as a new version. The one it replaces stays readable in the version history.'
              : 'A new pattern is saved inactive. Turn it on from the list when you have decided it is ready.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close the editor"
          className="mef-focus-ring rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* The pattern name. */}
      <label htmlFor="pattern-name" className={`${LABEL} mt-5`}>
        Pattern name
      </label>
      <input
        id="pattern-name"
        type="text"
        value={patternName}
        maxLength={PATTERN_NAME_MAX_LENGTH}
        placeholder="Hip area signals observed alongside kidney and bladder signals"
        onChange={(event) => setPatternName(event.target.value)}
        className={`${FIELD} mt-1.5`}
      />
      {nameWarning ? (
        <p className="mt-1.5 text-[13px] text-[#8A6A22]" role="status">
          {nameWarning}
        </p>
      ) : null}

      {/* ------------------------------------------------------------- */}
      {/* LEVEL 1. Observed inputs. */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-7 border-t border-[#1B3A2D]/10 pt-5">
        <h3 className={SECTION_TITLE}>{RELATIONSHIP_FORM_SECTIONS[0].title}</h3>
        <p className={BLURB}>{RELATIONSHIP_FORM_SECTIONS[0].blurb}</p>

        <div className="mt-4 rounded-2xl border border-[#1B3A2D]/10 bg-white p-3">
          <p className={LABEL}>Role</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ROLES.map((role) => (
              <button
                key={role}
                type="button"
                aria-pressed={draftRole === role}
                onClick={() => setDraftRole(role)}
                className={`${CHIP} ${draftRole === role ? CHIP_ON : CHIP_OFF}`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>

          {/* THREE PICKERS, ALL VISIBLE AT ONCE, rather than a "what kind
              of input" step in front of them. Same shape as the Add Signal
              tool: the ways in are beside each other and they meet in the
              same list below. A coach who knows the signal types it; one
              who is thinking in systems picks a body system; one who is
              thinking in places picks a body area. */}
          <label htmlFor="signal-picker" className={`${LABEL} mt-4`}>
            Search the signal names
          </label>
          <div className="relative mt-1.5">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              id="signal-picker"
              type="search"
              autoComplete="off"
              value={signalQuery}
              placeholder="Hip clicking, frequent urination, low-back tightness"
              onChange={(event) => setSignalQuery(event.target.value)}
              className={`${FIELD} pl-9`}
            />
          </div>
          {signalMatches.length > 0 ? (
            <ul className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-[#1B3A2D]/10 bg-white">
              {signalMatches.map((name) => (
                <li key={name.signalSlug}>
                  <button
                    type="button"
                    onClick={() => addComponent('signal', name.signalSlug)}
                    className="mef-focus-ring block w-full px-4 py-2.5 text-left text-sm text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.04]"
                  >
                    {name.displayName}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* INLINE, AND THROUGH THE SAME INSERT-ONLY DOOR Add Signal uses.
              A name the library has never held becomes one, once, so the
              next coach finds it by typing. */}
          {signalQuery.trim().length >= 2 && !exactNameExists ? (
            <div className="mt-3 rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3">
              <p className="text-[13px] text-[#4F645A]">
                No standardized signal is called that yet. You can add it now, and every later
                entry and search will find it.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label htmlFor="new-name-category" className="sr-only">
                  Body system for the new signal
                </label>
                <select
                  id="new-name-category"
                  value={newNameCategory}
                  onChange={(event) => setNewNameCategory(event.target.value)}
                  className={`${FIELD} w-auto min-w-[10rem]`}
                >
                  {categories.map((category) => (
                    <option key={category.categoryKey} value={category.categoryKey}>
                      {category.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddNewName}
                  disabled={addingName}
                  className={OUTLINE_BUTTON}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  {addingName ? 'Adding' : `Add "${signalQuery.trim()}" as a signal`}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="category-picker" className={LABEL}>
                Or a whole body system
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <select
                  id="category-picker"
                  value={categoryDraftKey}
                  onChange={(event) => setCategoryDraftKey(event.target.value)}
                  className={`${FIELD} w-auto min-w-[11rem]`}
                >
                  <option value="">Choose one</option>
                  {categories.map((category) => (
                    <option key={category.categoryKey} value={category.categoryKey}>
                      {category.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!categoryDraftKey}
                  onClick={() => {
                    addComponent('category', categoryDraftKey);
                    setCategoryDraftKey('');
                  }}
                  className={OUTLINE_BUTTON}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Add
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="area-picker" className={LABEL}>
                Or a body area
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <select
                  id="area-picker"
                  value={areaDraftKey}
                  onChange={(event) => setAreaDraftKey(event.target.value)}
                  className={`${FIELD} w-auto min-w-[11rem]`}
                >
                  <option value="">Choose one</option>
                  {bodyAreas.map((area) => (
                    <option key={area.areaKey} value={area.areaKey}>
                      {area.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!areaDraftKey}
                  onClick={() => {
                    addComponent('body_area', areaDraftKey);
                    setAreaDraftKey('');
                  }}
                  className={OUTLINE_BUTTON}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* The inputs already chosen, grouped by role. */}
        {ROLES.map((role) => {
          const rows = byRole(role);
          return (
            <div key={role} className="mt-4">
              <p className={LABEL}>
                {ROLE_LABELS[role]} inputs
                {rows.length > 0 ? ` (${rows.length})` : ''}
              </p>
              {rows.length === 0 ? (
                <p className="mt-1 text-[13px] text-[#6B7A72]">
                  {role === 'primary'
                    ? 'At least one primary input is needed before this pattern can be saved.'
                    : 'None yet.'}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {rows.map((row) => (
                    <li
                      key={row.uid}
                      className="rounded-2xl border border-[#1B3A2D]/10 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1B3A2D]">{row.refLabel}</p>
                          <p className="text-[12px] uppercase tracking-wider text-[#6B7A72]">
                            {REF_KIND_LABELS[row.refKind]}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeComponent(row.uid)}
                          aria-label={`Remove ${row.refLabel}`}
                          className="mef-focus-ring rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {SIDE_ORDER.map((option) => (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={row.side === option}
                            onClick={() =>
                              updateComponent(row.uid, {
                                side: row.side === option ? null : option,
                              })
                            }
                            className={`${CHIP} ${row.side === option ? CHIP_ON : CHIP_OFF}`}
                          >
                            {SIDE_LABELS[option]}
                          </button>
                        ))}
                      </div>

                      {row.role === 'support' ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div>
                            <label htmlFor={`value-${row.uid}`} className={LABEL}>
                              Counts as support at this answer
                            </label>
                            <input
                              id={`value-${row.uid}`}
                              type="text"
                              value={row.valueLabel}
                              placeholder="Often, or Speaking loudly"
                              onChange={(event) =>
                                updateComponent(row.uid, { valueLabel: event.target.value })
                              }
                              className={`${FIELD} mt-1.5`}
                            />
                          </div>
                          <div>
                            <label htmlFor={`min-${row.uid}`} className={LABEL}>
                              Or at this value and above
                            </label>
                            <input
                              id={`min-${row.uid}`}
                              type="number"
                              min={0}
                              value={row.minValueNumeric}
                              placeholder="3"
                              onChange={(event) =>
                                updateComponent(row.uid, { minValueNumeric: event.target.value })
                              }
                              className={`${FIELD} mt-1.5`}
                            />
                          </div>
                          <div>
                            <label htmlFor={`ref-${row.uid}`} className={LABEL}>
                              Questionnaire reference, if you mean one question
                            </label>
                            <input
                              id={`ref-${row.uid}`}
                              type="text"
                              value={row.sourceQuestionRef}
                              placeholder="T2"
                              onChange={(event) =>
                                updateComponent(row.uid, { sourceQuestionRef: event.target.value })
                              }
                              className={`${FIELD} mt-1.5`}
                            />
                          </div>
                          <div>
                            <label htmlFor={`prompt-${row.uid}`} className={LABEL}>
                              The question as it reads
                            </label>
                            <input
                              id={`prompt-${row.uid}`}
                              type="text"
                              value={row.sourceQuestionPrompt}
                              placeholder="My hands or feet stay cold even in warm rooms."
                              onChange={(event) =>
                                updateComponent(row.uid, {
                                  sourceQuestionPrompt: event.target.value,
                                })
                              }
                              className={`${FIELD} mt-1.5`}
                            />
                          </div>
                        </div>
                      ) : null}

                      <label htmlFor={`note-${row.uid}`} className={`${LABEL} mt-3`}>
                        Note, optional
                      </label>
                      <input
                        id={`note-${row.uid}`}
                        type="text"
                        value={row.note}
                        placeholder="One line, if it helps"
                        onChange={(event) => updateComponent(row.uid, { note: event.target.value })}
                        className={`${FIELD} mt-1.5`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* LEVEL 2. Pattern composition. */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-7 border-t border-[#1B3A2D]/10 pt-5">
        <h3 className={SECTION_TITLE}>{RELATIONSHIP_FORM_SECTIONS[1].title}</h3>
        <p className={BLURB}>{RELATIONSHIP_FORM_SECTIONS[1].blurb}</p>

        <label htmlFor="min-supporting" className={`${LABEL} mt-4`}>
          Minimum supporting signals before this pattern may surface
        </label>
        <input
          id="min-supporting"
          type="number"
          min={1}
          value={minSupporting}
          onChange={(event) => setMinSupporting(event.target.value)}
          className={`${FIELD} mt-1.5 w-28`}
        />

        <p className={`${LABEL} mt-5`}>Strength levels</p>
        <ul className="mt-2 space-y-2">
          {levels.map((level) => (
            <li key={level.uid} className="rounded-2xl border border-[#1B3A2D]/10 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`level-name-${level.uid}`} className={LABEL}>
                    Level name
                  </label>
                  <input
                    id={`level-name-${level.uid}`}
                    type="text"
                    value={level.displayLabel}
                    placeholder="Emerging"
                    onChange={(event) =>
                      setLevels((current) =>
                        current.map((row) =>
                          row.uid === level.uid
                            ? { ...row, displayLabel: event.target.value }
                            : row
                        )
                      )
                    }
                    className={`${FIELD} mt-1.5`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setLevels((current) => current.filter((row) => row.uid !== level.uid))
                  }
                  aria-label={`Remove the ${level.displayLabel} level`}
                  className="mef-focus-ring mt-6 rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <label htmlFor={`level-sup-${level.uid}`} className={LABEL}>
                    Supporting signals
                  </label>
                  <input
                    id={`level-sup-${level.uid}`}
                    type="number"
                    min={1}
                    value={level.minSupportingSignals}
                    onChange={(event) =>
                      setLevels((current) =>
                        current.map((row) =>
                          row.uid === level.uid
                            ? { ...row, minSupportingSignals: event.target.value }
                            : row
                        )
                      )
                    }
                    className={`${FIELD} mt-1.5`}
                  />
                </div>
                <div>
                  <label htmlFor={`level-cat-${level.uid}`} className={LABEL}>
                    Body systems, optional
                  </label>
                  <input
                    id={`level-cat-${level.uid}`}
                    type="number"
                    min={1}
                    value={level.minDistinctCategories}
                    onChange={(event) =>
                      setLevels((current) =>
                        current.map((row) =>
                          row.uid === level.uid
                            ? { ...row, minDistinctCategories: event.target.value }
                            : row
                        )
                      )
                    }
                    className={`${FIELD} mt-1.5`}
                  />
                </div>
                <div>
                  <label htmlFor={`level-rel-${level.uid}`} className={LABEL}>
                    Related inputs, optional
                  </label>
                  <input
                    id={`level-rel-${level.uid}`}
                    type="number"
                    min={0}
                    value={level.minRelatedSignals}
                    onChange={(event) =>
                      setLevels((current) =>
                        current.map((row) =>
                          row.uid === level.uid
                            ? { ...row, minRelatedSignals: event.target.value }
                            : row
                        )
                      )
                    }
                    className={`${FIELD} mt-1.5`}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
        {levels.length < MAX_STRENGTH_LEVELS ? (
          <button
            type="button"
            onClick={() =>
              setLevels((current) => [
                ...current,
                {
                  uid: nextUid(),
                  levelKey: '',
                  displayLabel: '',
                  minSupportingSignals: '2',
                  minDistinctCategories: '',
                  minRelatedSignals: '',
                },
              ])
            }
            className={`${OUTLINE_BUTTON} mt-3`}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Add a strength level
          </button>
        ) : null}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* LEVEL 3. Possible Association text. */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-7 border-t border-[#1B3A2D]/10 pt-5">
        <h3 className={SECTION_TITLE}>{RELATIONSHIP_FORM_SECTIONS[2].title}</h3>
        <p className={BLURB}>{RELATIONSHIP_FORM_SECTIONS[2].blurb}</p>
        <label htmlFor="association" className="sr-only">
          Possible Association text
        </label>
        <textarea
          id="association"
          rows={5}
          value={association}
          placeholder="When these are observed together in the same period, that pairing may be relevant and is worth exploring in conversation."
          onChange={(event) => setAssociation(event.target.value)}
          className={`${TEXTAREA} mt-3`}
        />
        <p className="mt-1.5 text-[12px] text-[#6B7A72]">
          This feature writes in association language: {ASSOCIATION_VOCABULARY.join(', ')}.
        </p>
        {associationWarning ? (
          <p className="mt-1.5 text-[13px] text-[#8A6A22]" role="status">
            {associationWarning}
          </p>
        ) : null}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* LEVEL 4. Coaching Considerations. */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-7 border-t border-[#1B3A2D]/10 pt-5">
        <h3 className={SECTION_TITLE}>{RELATIONSHIP_FORM_SECTIONS[3].title}</h3>
        <p className={BLURB}>{RELATIONSHIP_FORM_SECTIONS[3].blurb}</p>
        <ul className="mt-3 space-y-2">
          {considerations.map((line, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={`consideration-${index}`} className="flex items-start gap-2">
              <label htmlFor={`consideration-${index}`} className="sr-only">
                Coaching consideration {index + 1}
              </label>
              <input
                id={`consideration-${index}`}
                type="text"
                value={line}
                maxLength={CONSIDERATION_MAX_LENGTH}
                placeholder="What is worth exploring, or worth asking about next"
                onChange={(event) =>
                  setConsiderations((current) =>
                    current.map((item, position) =>
                      position === index ? event.target.value : item
                    )
                  )
                }
                className={FIELD}
              />
              <button
                type="button"
                onClick={() =>
                  setConsiderations((current) =>
                    current.filter((_item, position) => position !== index)
                  )
                }
                aria-label={`Remove coaching consideration ${index + 1}`}
                className="mef-focus-ring mt-1 rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {considerations.length < MAX_CONSIDERATIONS ? (
          <button
            type="button"
            onClick={() => setConsiderations((current) => [...current, ''])}
            className={`${OUTLINE_BUTTON} mt-3`}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Add a consideration
          </button>
        ) : null}
        {considerationWarning ? (
          <p className="mt-2 text-[13px] text-[#8A6A22]" role="status">
            {considerationWarning}
          </p>
        ) : null}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* Private to her. */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-7 border-t border-[#1B3A2D]/10 pt-5">
        <h3 className={SECTION_TITLE}>{RELATIONSHIP_EVIDENCE_SECTION.title}</h3>
        <p className={BLURB}>{RELATIONSHIP_EVIDENCE_SECTION.blurb}</p>
        <label htmlFor="evidence" className="sr-only">
          Evidence and methodology notes
        </label>
        <textarea
          id="evidence"
          rows={4}
          value={evidence}
          placeholder="Your reasoning, your sources, and why you wrote the pattern this way."
          onChange={(event) => setEvidence(event.target.value)}
          className={`${TEXTAREA} mt-3`}
        />
      </section>

      {relationshipId ? (
        <section className="mt-7 border-t border-[#1B3A2D]/10 pt-5">
          <label htmlFor="change-summary" className={LABEL}>
            What changed, for the version history
          </label>
          <input
            id="change-summary"
            type="text"
            value={changeSummary}
            placeholder="One line, in your own words"
            onChange={(event) => setChangeSummary(event.target.value)}
            className={`${FIELD} mt-1.5`}
          />
        </section>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-[#8C2F1F]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={PRIMARY_BUTTON}
        >
          {isSaving ? 'Saving' : relationshipId ? 'Save as a new version' : 'Save pattern'}
        </button>
        <button type="button" onClick={onCancel} className={QUIET_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}
