'use client';

/**
 * Coach view of a client's Movement Profile — the coach-controlled fields
 * (migration 81's upsert_movement_profile_coach_fields), the member's own
 * declared goals/equipment/priorities for context (read-only here; the
 * member edits those from their own Movement Profile page), and the
 * Pending Coach Review worklist a coach resolves. is_active_coach_for RLS
 * (and the RPC's own check) is what actually restricts writes to this
 * client's assigned coach — same trust boundary as CoachNotesPanel.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, ClipboardList } from 'lucide-react';
import {
  resolveClientMovementProfileReviewItem,
  updateClientMovementProfileCoachFields,
} from '@/app/actions/movement-profile';
import { TagListEditor } from '@/components/movement-profile/TagListEditor';
import type { MemberMovementProfile, MovementProfileReviewItem } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const REVIEW_TYPE_LABEL: Record<string, string> = {
  new_pain_report: 'New pain report',
  increased_discomfort: 'Increased discomfort',
  repeated_inability: 'Repeated inability',
  possible_progression: 'Possible progression',
  possible_regression: 'Possible regression',
  capability_change: 'Capability change',
  new_movement_limitation: 'New movement limitation',
  restriction_conflict: 'Restriction conflict',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ReviewItemRow({ item, clientId }: { item: MovementProfileReviewItem; clientId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function resolve(status: 'acknowledged' | 'actioned' | 'dismissed') {
    startTransition(async () => {
      await resolveClientMovementProfileReviewItem(item.id, clientId, status);
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
          {REVIEW_TYPE_LABEL[item.review_type] ?? item.review_type}
        </span>
        <span className="text-xs text-[#6B7A72]">{formatTimestamp(item.created_at)}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-[#1B3A2D]">{item.summary}</p>
      {item.detail && <p className="mt-0.5 text-sm text-[#6B7A72]">{item.detail}</p>}
      {item.status === 'pending' ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => resolve('actioned')}
            className="rounded-full bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Mark actioned
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => resolve('dismissed')}
            className="rounded-full border border-[#1B3A2D]/15 px-3 py-1.5 text-xs font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/40 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-xs font-medium capitalize text-[#6B7A72]">{item.status}</p>
      )}
    </li>
  );
}

function ReadOnlyTagList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full bg-[#EFF6F1] px-3 py-1.5 text-xs font-medium text-[#1B3A2D]"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MovementProfilePanel({
  clientId,
  profile,
  reviewItems,
}: {
  clientId: string;
  profile: MemberMovementProfile | null;
  reviewItems: MovementProfileReviewItem[];
}) {
  const router = useRouter();
  const [movementLimitations, setMovementLimitations] = useState(
    profile?.movement_limitations ?? []
  );
  const [exerciseRestrictions, setExerciseRestrictions] = useState(
    profile?.exercise_restrictions ?? []
  );
  const [contraindications, setContraindications] = useState(profile?.contraindications ?? []);
  const [medicalRestrictions, setMedicalRestrictions] = useState(
    profile?.medical_restrictions ?? []
  );
  const [correctivePriorities, setCorrectivePriorities] = useState(
    profile?.corrective_priorities ?? []
  );
  const [exerciseClearance, setExerciseClearance] = useState(profile?.exercise_clearance ?? '');
  const [assessmentInterpretation, setAssessmentInterpretation] = useState(
    profile?.assessment_interpretation ?? ''
  );
  const [coachObservations, setCoachObservations] = useState(profile?.coach_observations ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const pendingItems = reviewItems.filter((i) => i.status === 'pending');
  const resolvedItems = reviewItems.filter((i) => i.status !== 'pending');

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateClientMovementProfileCoachFields(clientId, {
        movementLimitations,
        exerciseRestrictions,
        contraindications,
        medicalRestrictions,
        correctivePriorities,
        exerciseClearance: exerciseClearance.trim() ? exerciseClearance.trim() : null,
        assessmentInterpretation: assessmentInterpretation.trim()
          ? assessmentInterpretation.trim()
          : null,
        coachObservations: coachObservations.trim() ? coachObservations.trim() : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <>
      <section className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#854D0E]">
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Pending Movement Review ({pendingItems.length})
          </p>
        </div>
        {pendingItems.length === 0 ? (
          <p className="mt-3 text-sm text-[#6B7A72]">No open review items.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {pendingItems.map((item) => (
              <ReviewItemRow key={item.id} item={item} clientId={clientId} />
            ))}
          </ul>
        )}
        {resolvedItems.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-[#6B7A72]">
              {resolvedItems.length} resolved
            </summary>
            <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
              {resolvedItems.map((item) => (
                <ReviewItemRow key={item.id} item={item} clientId={clientId} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={`${CARD} space-y-4 p-6`}>
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Movement Profile</p>
        </div>

        {profile && (
          <div className="space-y-3 rounded-2xl bg-[#FAFAF8] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Declared by client
            </p>
            <ReadOnlyTagList label="Goals" values={profile.goals} />
            <ReadOnlyTagList label="Equipment access" values={profile.equipment_access} />
            <ReadOnlyTagList
              label="Favorite movement types"
              values={profile.favorite_movement_types}
            />
            {profile.goals.length === 0 &&
              profile.equipment_access.length === 0 &&
              profile.favorite_movement_types.length === 0 && (
                <p className="text-sm text-[#6B7A72]">Nothing declared yet.</p>
              )}
          </div>
        )}

        <TagListEditor
          label="Movement limitations"
          placeholder="e.g. No overhead loading"
          values={movementLimitations}
          onChange={setMovementLimitations}
        />
        <TagListEditor
          label="Exercise restrictions"
          placeholder="e.g. Avoid deep knee flexion"
          values={exerciseRestrictions}
          onChange={setExerciseRestrictions}
        />
        <TagListEditor
          label="Contraindications"
          placeholder="e.g. Recent shoulder surgery"
          values={contraindications}
          onChange={setContraindications}
        />
        <TagListEditor
          label="Medical restrictions"
          placeholder="e.g. Physician-directed low impact"
          values={medicalRestrictions}
          onChange={setMedicalRestrictions}
        />
        <TagListEditor
          label="Corrective priorities"
          placeholder="e.g. Anterior pelvic tilt"
          values={correctivePriorities}
          onChange={setCorrectivePriorities}
        />

        <div>
          <label
            htmlFor="exercise-clearance"
            className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]"
          >
            Exercise clearance
          </label>
          <textarea
            id="exercise-clearance"
            value={exerciseClearance}
            onChange={(e) => setExerciseClearance(e.target.value)}
            rows={2}
            className="mt-1.5 w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="assessment-interpretation"
            className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]"
          >
            Assessment interpretation
          </label>
          <textarea
            id="assessment-interpretation"
            value={assessmentInterpretation}
            onChange={(e) => setAssessmentInterpretation(e.target.value)}
            rows={2}
            className="mt-1.5 w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="coach-observations"
            className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]"
          >
            Coach observations
          </label>
          <textarea
            id="coach-observations"
            value={coachObservations}
            onChange={(e) => setCoachObservations(e.target.value)}
            rows={2}
            className="mt-1.5 w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          {savedAt ? <p className="text-sm font-medium text-[#1B3A2D]">Saved.</p> : <span />}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save Movement Profile'}
          </button>
        </div>
      </section>
    </>
  );
}
