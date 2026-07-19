'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Dumbbell,
  Eye,
  HelpCircle,
  Mic,
  Pencil,
  Plus,
  Sparkles,
  Stethoscope,
  Trash2,
  Waves,
  X,
} from 'lucide-react';
import type { AiObservationCategory, AssessmentAiSourceFeature } from '@mef/shared-types-contracts';
import type { CoachIntelligenceWorkspace } from '@/app/actions/coach-intelligence';
import {
  addReportExerciseAction,
  publishAiAnalysisReportAction,
  removeReportExerciseAction,
  runAiAnalysisAction,
  saveAiAnalysisDraftAction,
  updateAiAnalysisPersonalNotesAction,
  updateAiAnalysisSummaryAction,
  updateAiObservationAction,
} from '@/app/actions/coach-intelligence';
import { EmptyState } from './EmptyState';

const CATEGORY_META: Record<
  AiObservationCategory,
  { label: string; icon: typeof Eye; tone: 'default' | 'warning' }
> = {
  observation: { label: 'Key Observations', icon: Eye, tone: 'default' },
  compensation: { label: 'Potential Movement Compensations', icon: Waves, tone: 'default' },
  four_doctors_consideration: {
    label: 'Suggested Four Doctors Considerations',
    icon: Stethoscope,
    tone: 'default',
  },
  education_topic: { label: 'Suggested Education Topics', icon: BookOpen, tone: 'default' },
  corrective_exercise_category: {
    label: 'Suggested Corrective Exercise Categories',
    icon: Dumbbell,
    tone: 'default',
  },
  coach_question: {
    label: 'Questions You May Want to Ask the Member',
    icon: HelpCircle,
    tone: 'default',
  },
  red_flag: {
    label: 'Potential Red Flags — Requires Manual Review',
    icon: AlertTriangle,
    tone: 'warning',
  },
};

const CATEGORY_ORDER: AiObservationCategory[] = [
  'observation',
  'compensation',
  'four_doctors_consideration',
  'education_topic',
  'corrective_exercise_category',
  'coach_question',
  'red_flag',
];

function confidenceLabel(confidence: number): { text: string; className: string } {
  if (confidence >= 0.75)
    return { text: 'High confidence', className: 'bg-emerald-50 text-emerald-700' };
  if (confidence >= 0.5)
    return { text: 'Moderate confidence', className: 'bg-amber-50 text-amber-700' };
  return { text: 'Low confidence', className: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]' };
}

export function AIAssistantSection({
  workspace,
  sourceFeature,
  sourceRecordId,
  clientId,
  assessmentTypeLabel,
}: {
  workspace: CoachIntelligenceWorkspace | null;
  sourceFeature: AssessmentAiSourceFeature;
  sourceRecordId: string;
  clientId: string;
  assessmentTypeLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refresh() {
    router.refresh();
  }

  function handleRunAnalysis() {
    startTransition(async () => {
      await runAiAnalysisAction({
        sourceFeature,
        sourceRecordId,
        memberId: clientId,
        assessmentTypeLabel,
      });
      refresh();
    });
  }

  if (!workspace) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={Sparkles}
          title="No AI analysis yet"
          description="Run analysis to generate draft observations for you to review."
        />
        <button
          type="button"
          onClick={handleRunAnalysis}
          disabled={isPending}
          className="w-full rounded-full bg-[#1B3A2D] px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Running…' : 'Run Analysis'}
        </button>
      </div>
    );
  }

  const { analysis, observations, exercises } = workspace;
  const isPublished = analysis.status === 'published';

  // Every non-terminal-with-data provider_status lands here: not_configured
  // (expected today, no provider registered), failed (a real, reachable
  // state — performCoachIntelligenceAnalysis's catch block sets exactly
  // this), and pending (should self-resolve within the same request given
  // this pipeline is synchronous, but could persist if the process died
  // mid-run — same "never a dead end" treatment either way).
  if (observations.length === 0 && analysis.provider_status !== 'completed') {
    const isFailed = analysis.provider_status === 'failed';
    return (
      <div className="space-y-3">
        <EmptyState
          icon={isFailed ? AlertTriangle : Sparkles}
          title={isFailed ? 'Analysis failed' : 'Pending AI Analysis'}
          description={
            isFailed
              ? (analysis.provider_error ?? 'The last analysis attempt did not complete.')
              : 'No Coach Intelligence provider is connected yet. This assessment is saved and will be analyzed automatically once one is.'
          }
        />
        <button
          type="button"
          onClick={handleRunAnalysis}
          disabled={isPending}
          className="w-full rounded-full border border-[#1B3A2D]/15 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Checking…' : isFailed ? 'Retry Analysis' : 'Check Again'}
        </button>
        <PersonalNotesAndExercises
          analysisId={analysis.id}
          clientId={clientId}
          initialNotes={analysis.coach_personal_notes}
          exercises={exercises}
          onChanged={refresh}
        />
        <PublishBar
          analysisId={analysis.id}
          clientId={clientId}
          assessmentTypeLabel={assessmentTypeLabel}
          isPublished={isPublished}
          onChanged={refresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SummaryCard analysis={analysis} onChanged={refresh} />

      {analysis.overall_confidence !== null && (
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${confidenceLabel(analysis.overall_confidence).className}`}
          >
            {confidenceLabel(analysis.overall_confidence).text}
          </span>
          <span className="text-xs text-[#6B7A72]">
            Overall confidence · {Math.round(analysis.overall_confidence * 100)}%
          </span>
        </div>
      )}

      {CATEGORY_ORDER.map((category) => {
        const items = observations.filter((o) => o.category === category);
        if (items.length === 0) return null;
        const meta = CATEGORY_META[category];
        return (
          <div key={category}>
            <p
              className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${
                meta.tone === 'warning' ? 'text-red-700' : 'text-[#854D0E]'
              }`}
            >
              <meta.icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {meta.label}
            </p>
            <div className="space-y-2">
              {items.map((observation) => (
                <ObservationCard key={observation.id} observation={observation} tone={meta.tone} />
              ))}
            </div>
          </div>
        );
      })}

      <PersonalNotesAndExercises
        analysisId={analysis.id}
        clientId={clientId}
        initialNotes={analysis.coach_personal_notes}
        exercises={exercises}
        onChanged={refresh}
      />

      <button
        type="button"
        disabled
        title="Coming soon"
        className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-dashed border-[#1B3A2D]/15 px-4 py-2.5 text-sm font-medium text-[#6B7A72] opacity-60"
      >
        <Mic className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Record Voice Message — Coming soon
      </button>

      <PublishBar
        analysisId={analysis.id}
        clientId={clientId}
        assessmentTypeLabel={assessmentTypeLabel}
        isPublished={isPublished}
        onChanged={refresh}
      />
    </div>
  );
}

function SummaryCard({
  analysis,
  onChanged,
}: {
  analysis: CoachIntelligenceWorkspace['analysis'];
  onChanged: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(analysis.coach_summary ?? analysis.ai_summary ?? '');
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateAiAnalysisSummaryAction({ analysisId: analysis.id, coachSummary: value });
      setIsEditing(false);
      onChanged();
    });
  }

  return (
    <div className="rounded-2xl bg-[#FAFAF8] p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          AI Summary
        </p>
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-[#6B7A72] transition hover:text-[#1B3A2D]"
            title="Edit summary"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            autoFocus
            className="w-full resize-none rounded-xl border border-[#1B3A2D]/10 bg-white p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setValue(analysis.coach_summary ?? analysis.ai_summary ?? '');
                setIsEditing(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded-full bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-[#1B3A2D]">{value || 'No summary yet.'}</p>
      )}
    </div>
  );
}

function ObservationCard({
  observation,
  tone,
}: {
  observation: CoachIntelligenceWorkspace['observations'][number];
  tone: 'default' | 'warning';
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(observation.coach_text ?? observation.ai_text);

  function decide(status: 'accepted' | 'rejected') {
    startTransition(async () => {
      await updateAiObservationAction({ observationId: observation.id, status });
      router.refresh();
    });
  }

  function saveEdit() {
    startTransition(async () => {
      await updateAiObservationAction({ observationId: observation.id, coachText: text });
      setIsEditing(false);
      router.refresh();
    });
  }

  const displayText = observation.coach_text ?? observation.ai_text;

  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        tone === 'warning'
          ? 'border-red-100 bg-red-50/60'
          : observation.status === 'accepted'
            ? 'border-emerald-100 bg-emerald-50/40'
            : observation.status === 'rejected'
              ? 'border-[#1B3A2D]/[0.06] bg-[#FAFAF8] opacity-60'
              : 'border-[#1B3A2D]/[0.06] bg-[#FAFAF8]'
      }`}
    >
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            autoFocus
            className="w-full resize-none rounded-xl border border-[#1B3A2D]/10 bg-white p-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setText(displayText);
                setIsEditing(false);
              }}
              className="rounded-full px-3 py-1 text-xs font-medium text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={isPending}
              className="rounded-full bg-[#1B3A2D] px-3 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-[#1B3A2D]">{displayText}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {observation.confidence !== null && (
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#6B7A72]">
            {Math.round(observation.confidence * 100)}% confidence
          </span>
        )}
        {observation.severity &&
          observation.severity !== 'unknown' &&
          observation.severity !== 'none' && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium capitalize text-[#6B7A72]">
              {observation.severity}
            </span>
          )}

        <div className="ml-auto flex items-center gap-1">
          {!isEditing && (
            <button
              type="button"
              title="Edit wording"
              onClick={() => setIsEditing(true)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[#6B7A72] hover:bg-white"
            >
              <Pencil className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button
            type="button"
            title="Accept"
            disabled={isPending}
            onClick={() => decide('accepted')}
            className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
              observation.status === 'accepted'
                ? 'bg-emerald-600 text-white'
                : 'text-[#6B7A72] hover:bg-white'
            }`}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            title="Reject"
            disabled={isPending}
            onClick={() => decide('rejected')}
            className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
              observation.status === 'rejected'
                ? 'bg-[#1B3A2D] text-white'
                : 'text-[#6B7A72] hover:bg-white'
            }`}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonalNotesAndExercises({
  analysisId,
  clientId,
  initialNotes,
  exercises,
  onChanged,
}: {
  analysisId: string;
  clientId: string;
  initialNotes: string | null;
  exercises: CoachIntelligenceWorkspace['exercises'];
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPending, startTransition] = useTransition();

  function saveNotes() {
    startTransition(async () => {
      await updateAiAnalysisPersonalNotesAction({ analysisId, notes });
      onChanged();
    });
  }

  function addExercise() {
    if (!name.trim()) return;
    startTransition(async () => {
      await addReportExerciseAction({
        analysisId,
        memberId: clientId,
        name: name.trim(),
        description: description.trim() || undefined,
        sortOrder: exercises.length,
      });
      setName('');
      setDescription('');
      setShowAddForm(false);
      onChanged();
    });
  }

  function removeExercise(exerciseId: string) {
    startTransition(async () => {
      await removeReportExerciseAction(exerciseId);
      onChanged();
    });
  }

  return (
    <>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
          Personal Notes
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={2}
          placeholder="Notes only you can see…"
          className="w-full resize-none rounded-xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            Recommended Exercises
          </p>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-[#1B3A2D] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Add
          </button>
        </div>

        {exercises.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {exercises.map((exercise) => (
              <li
                key={exercise.id}
                className="flex items-start justify-between gap-2 rounded-xl bg-[#FAFAF8] p-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-[#1B3A2D]">{exercise.name}</p>
                  {exercise.description && (
                    <p className="text-xs text-[#6B7A72]">{exercise.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeExercise(exercise.id)}
                  disabled={isPending}
                  className="shrink-0 text-[#6B7A72] hover:text-red-600"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {showAddForm && (
          <div className="space-y-2 rounded-xl bg-[#FAFAF8] p-2.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Exercise name"
              className="w-full rounded-lg border border-[#1B3A2D]/10 bg-white p-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instructions (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-[#1B3A2D]/10 bg-white p-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addExercise}
                disabled={isPending || !name.trim()}
                className="rounded-full bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
              >
                Add exercise
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function PublishBar({
  analysisId,
  clientId,
  assessmentTypeLabel,
  isPublished,
  onChanged,
}: {
  analysisId: string;
  clientId: string;
  assessmentTypeLabel: string;
  isPublished: boolean;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<'draft' | 'publish' | null>(null);

  function saveDraft() {
    setPendingAction('draft');
    startTransition(async () => {
      await saveAiAnalysisDraftAction(analysisId);
      setPendingAction(null);
      onChanged();
    });
  }

  function publish() {
    setPendingAction('publish');
    startTransition(async () => {
      await publishAiAnalysisReportAction({ analysisId, memberId: clientId, assessmentTypeLabel });
      setPendingAction(null);
      onChanged();
    });
  }

  if (isPublished) {
    return (
      <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">
        Report published — visible in the member portal.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={saveDraft}
        disabled={isPending}
        className="rounded-full border border-[#1B3A2D]/15 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pendingAction === 'draft' ? 'Saving…' : 'Save as Draft'}
      </button>
      <button
        type="button"
        onClick={publish}
        disabled={isPending}
        className="rounded-full bg-[#1B3A2D] px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pendingAction === 'publish' ? 'Publishing…' : 'Approve and Publish Report'}
      </button>
    </div>
  );
}
