'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Archive, Copy, Pencil, ShieldCheck } from 'lucide-react';
import type { BlueprintPeriodization, BlueprintStatus } from '@mef/shared-types-contracts';
import {
  approveBlueprintVersionAction,
  archiveBlueprintVersionAction,
  duplicateBlueprintAction,
  editBlueprintVersionAction,
} from '@/app/actions/program-blueprints';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const FIELD =
  'mt-1 w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';

export interface BlueprintEditableFields {
  displayName: string;
  memberTitle: string;
  memberDescription: string;
  coachPurpose: string;
  intendedPopulation: string;
  cautions: string;
  notes: string;
  durationWeeks: string;
  sessionsPerWeek: string;
  equipmentMode: string;
  periodization: string;
}

function nullable(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

function nullableNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

/**
 * Edit, Approve, Archive and Duplicate, all administrator only.
 *
 * THE EDIT RULE, on screen. A draft is edited in place, because nobody has
 * ever been given it. An approved version is never edited: saving one
 * produces the NEXT version, in draft, with every slot copied, and this
 * screen follows the coach to it. The button says which of the two is
 * about to happen, so it is never a surprise.
 *
 * Approve asks first, and the question says what approving means, because
 * "approved" is the moment a program becomes something a coach can put in
 * front of a real person.
 */
export function BlueprintAdminActions({
  versionId,
  programName,
  status,
  versionNumber,
  unfilledSlots,
  initial,
}: {
  versionId: string;
  programName: string;
  status: BlueprintStatus;
  versionNumber: number;
  unfilledSlots: number;
  initial: BlueprintEditableFields;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<BlueprintEditableFields>(initial);
  const [editing, setEditing] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isArchived = status === 'archived';
  const editProducesNewVersion = status === 'approved';

  function set<K extends keyof BlueprintEditableFields>(key: K, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    setNotice(null);
    setBusy('save');
    const result = await editBlueprintVersionAction(versionId, {
      displayName: fields.displayName.trim() || programName,
      memberTitle: nullable(fields.memberTitle),
      memberDescription: nullable(fields.memberDescription),
      coachPurpose: nullable(fields.coachPurpose),
      intendedPopulation: nullable(fields.intendedPopulation),
      cautions: nullable(fields.cautions),
      notes: nullable(fields.notes),
      durationWeeks: nullableNumber(fields.durationWeeks),
      sessionsPerWeek: nullableNumber(fields.sessionsPerWeek),
      equipmentMode: (nullable(fields.equipmentMode) ?? 'home') as 'home' | 'gym' | 'mixed',
      periodization: (nullable(fields.periodization) as BlueprintPeriodization | null) ?? null,
    });
    setBusy(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setEditing(false);
    if (result.versionId !== versionId) {
      router.push(`/admin/blueprints/${result.versionId}` as Route);
      return;
    }
    router.refresh();
  }

  async function handleApprove() {
    setError(null);
    setNotice(null);
    setBusy('approve');
    const result = await approveBlueprintVersionAction(versionId);
    setBusy(null);
    setConfirmingApprove(false);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleArchive() {
    if (
      !confirm(
        `Archive ${programName} v${versionNumber}? It will start nothing new. Every program already running from it keeps running, and nothing is deleted.`
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy('archive');
    const result = await archiveBlueprintVersionAction(versionId);
    setBusy(null);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDuplicate() {
    setError(null);
    setNotice(null);
    setBusy('duplicate');
    const result = await duplicateBlueprintAction(versionId, duplicateName);
    setBusy(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setDuplicating(false);
    setDuplicateName('');
    router.push(`/admin/blueprints/${result.versionId}` as Route);
  }

  return (
    <section className={`${CARD} mt-6 p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Actions</p>

      {error && <div className="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {notice && (
        <div className="mt-3 rounded-2xl bg-[#EFF6F1] p-4 text-sm text-[#1B3A2D]">{notice}</div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Edit                                                  */}
      {/* ---------------------------------------------------- */}
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={isArchived || busy !== null}
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-[#1B3A2D] hover:opacity-80 disabled:opacity-40"
        >
          <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {isArchived
            ? 'An archived version cannot be edited'
            : editProducesNewVersion
              ? 'Edit (creates version ' + (versionNumber + 1) + ' as a draft)'
              : 'Edit this draft'}
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="rounded-2xl bg-[#EFF6F1] px-4 py-3 text-xs leading-relaxed text-[#1B3A2D]">
            {editProducesNewVersion
              ? `This version is approved, so saving does not change it. It writes version ${versionNumber + 1} as a new draft, with every slot copied, and leaves this one exactly as it is. Anything already assigned from it still reads what it was given.`
              : 'This version is a draft nobody has been given, so saving changes it in place.'}
          </p>

          <label className="block">
            <span className="text-xs font-medium text-[#6B7A72]">Version name</span>
            <input
              type="text"
              value={fields.displayName}
              onChange={(e) => set('displayName', e.target.value)}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#6B7A72]">
              Title a member sees
            </span>
            <input
              type="text"
              value={fields.memberTitle}
              onChange={(e) => set('memberTitle', e.target.value)}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#6B7A72]">
              Description a member reads
            </span>
            <textarea
              value={fields.memberDescription}
              onChange={(e) => set('memberDescription', e.target.value)}
              rows={3}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#6B7A72]">Purpose (coach only)</span>
            <textarea
              value={fields.coachPurpose}
              onChange={(e) => set('coachPurpose', e.target.value)}
              rows={3}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#6B7A72]">
              Intended for (coach only)
            </span>
            <textarea
              value={fields.intendedPopulation}
              onChange={(e) => set('intendedPopulation', e.target.value)}
              rows={2}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#6B7A72]">Cautions (coach only)</span>
            <textarea
              value={fields.cautions}
              onChange={(e) => set('cautions', e.target.value)}
              rows={3}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#6B7A72]">Version notes</span>
            <textarea
              value={fields.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className={FIELD}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-[#6B7A72]">Weeks</span>
              <input
                type="text"
                inputMode="numeric"
                value={fields.durationWeeks}
                onChange={(e) => set('durationWeeks', e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#6B7A72]">Sessions a week</span>
              <input
                type="text"
                inputMode="numeric"
                value={fields.sessionsPerWeek}
                onChange={(e) => set('sessionsPerWeek', e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#6B7A72]">Equipment</span>
              <select
                value={fields.equipmentMode}
                onChange={(e) => set('equipmentMode', e.target.value)}
                className={FIELD}
              >
                <option value="home">home</option>
                <option value="gym">gym</option>
                <option value="mixed">mixed</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#6B7A72]">Progression</span>
              <select
                value={fields.periodization}
                onChange={(e) => set('periodization', e.target.value)}
                className={FIELD}
              >
                <option value="">not set</option>
                <option value="linear">linear</option>
                <option value="undulating">undulating</option>
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setFields(initial);
                setEditing(false);
                setError(null);
              }}
              disabled={busy !== null}
              className="flex-1 rounded-full bg-[#1B3A2D]/[0.08] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.14] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy !== null}
              className="flex-1 rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'save'
                ? 'Saving…'
                : editProducesNewVersion
                  ? `Save as version ${versionNumber + 1}`
                  : 'Save draft'}
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Approve                                               */}
      {/* ---------------------------------------------------- */}
      {status === 'draft' && (
        <div className="mt-6 rounded-2xl bg-[#FAFAF8] p-4">
          {!confirmingApprove ? (
            <button
              type="button"
              onClick={() => setConfirmingApprove(true)}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Approve this version
            </button>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-[#1B3A2D]">
                Approving {programName} v{versionNumber} makes it assignable. From that moment any
                coach can give it to a member, exactly as it reads on this screen. It stops being
                editable: a later change becomes version {versionNumber + 1} as a new draft.
              </p>
              {unfilledSlots > 0 && (
                <p className="mt-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {unfilledSlots} slot{unfilledSlots === 1 ? ' has' : 's have'} no exercise in{' '}
                  {unfilledSlots === 1 ? 'it' : 'them'}. Fill{' '}
                  {unfilledSlots === 1 ? 'it' : 'them'} before approving.
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setConfirmingApprove(false)}
                  disabled={busy !== null}
                  className="flex-1 rounded-full bg-[#1B3A2D]/[0.08] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.14] disabled:opacity-50"
                >
                  Not yet
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={busy !== null || unfilledSlots > 0}
                  className="flex-1 rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy === 'approve' ? 'Approving…' : 'Yes, make it assignable'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Duplicate and Archive                                 */}
      {/* ---------------------------------------------------- */}
      <div className="mt-6 border-t border-[#1B3A2D]/10 pt-5">
        {!duplicating ? (
          <button
            type="button"
            onClick={() => {
              setDuplicating(true);
              setDuplicateName(`${programName} copy`);
            }}
            disabled={busy !== null}
            className="flex items-center gap-1.5 text-sm font-medium text-[#1B3A2D] hover:opacity-80 disabled:opacity-40"
          >
            <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Duplicate as a new program
          </button>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-[#6B7A72]">
                Name for the new program. It starts as its own version 1, in draft, with every slot
                copied. Nothing about {programName} changes.
              </span>
              <input
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                aria-label="Name for the duplicated program"
                className={FIELD}
              />
            </label>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => setDuplicating(false)}
                disabled={busy !== null}
                className="flex-1 rounded-full bg-[#1B3A2D]/[0.08] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.14] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={busy !== null || duplicateName.trim() === ''}
                className="flex-1 rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy === 'duplicate' ? 'Duplicating…' : 'Create the duplicate'}
              </button>
            </div>
          </div>
        )}

        {status !== 'archived' && (
          <button
            type="button"
            onClick={handleArchive}
            disabled={busy !== null}
            className="mt-4 flex items-center gap-1.5 text-sm font-medium text-red-700 hover:opacity-80 disabled:opacity-40"
          >
            <Archive className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {busy === 'archive' ? 'Archiving…' : 'Archive this version'}
          </button>
        )}
      </div>
    </section>
  );
}
