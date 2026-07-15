'use client';

/**
 * The complete guided assessment flow: Welcome -> Preparation -> Lighting
 * -> Camera Positioning -> Clothing -> Privacy -> one CameraCapture step
 * per lib/body-assessment/assessmentTypes.ts's config -> Review -> Upload
 * -> Processing -> redirect to the results page. A single client
 * component drives all of it with local step state (mirrors how
 * OnboardingForm/CheckinForm keep one page's worth of state client-side,
 * just with more distinct step screens since a camera flow genuinely
 * needs them, unlike a scrolling form).
 *
 * Media bytes upload directly from the browser to Supabase Storage using
 * the same authenticated session (lib/supabase/client.ts) — RLS
 * (migration 37) is what actually authorizes each upload; the server
 * action only computes the path and records metadata afterward.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Sun,
  Camera as CameraIcon,
  Shirt,
  Lock,
  Sparkles,
  RotateCcw,
  Trash2,
  Loader2,
} from 'lucide-react';
import type { BodyAssessmentType } from '@mef/shared-types-contracts';
import {
  getAssessmentTypeConfig,
  type CaptureStepConfig,
} from '@/lib/body-assessment/assessmentTypes';
import { createClient } from '@/lib/supabase/client';
import {
  startAssessmentAction,
  buildCaptureUploadPathAction,
  recordCaptureAction,
  recordLandmarkSetAction,
  recordPostureFindingsAction,
  deleteCaptureAction,
  submitAssessmentAction,
} from '@/app/actions/body-assessment';
import { CameraCapture, type CapturedMedia } from './CameraCapture';
import { requestDeviceTiltPermission } from '@/hooks/useDeviceTilt';
import { POSE_MODEL_VERSION } from '@/hooks/usePoseLandmarker';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

type IntroStep = {
  key: string;
  title: string;
  icon: typeof Sun;
  body: string[];
};

const INTRO_STEPS: IntroStep[] = [
  {
    key: 'preparation',
    title: 'Getting ready',
    icon: Sparkles,
    body: [
      'This guided assessment walks you through a few photos and short videos so your coach can track your posture and movement over time.',
      'You can pause and retake any capture — nothing is final until you review and submit.',
    ],
  },
  {
    key: 'lighting',
    title: 'Lighting',
    icon: Sun,
    body: [
      'Find a well-lit room — natural daylight or a bright overhead light works well.',
      'Avoid strong backlighting (like standing in front of a window) — it can make you hard to see.',
    ],
  },
  {
    key: 'camera_positioning',
    title: 'Camera positioning',
    icon: CameraIcon,
    body: [
      'Prop your phone or laptop upright, about six feet away, at chest height.',
      'Make sure your whole body will fit in the frame before each capture.',
    ],
  },
  {
    key: 'clothing',
    title: 'What to wear',
    icon: Shirt,
    body: [
      'Form-fitting clothing (like what you’d wear to exercise) helps your coach see your posture clearly.',
      'Avoid baggy layers, hoods, and hats where possible.',
    ],
  },
  {
    key: 'privacy',
    title: 'Your privacy',
    icon: Lock,
    body: [
      'Your photos and videos are stored privately and are only visible to you and your assigned coach.',
      'You can request deletion of any assessment at any time from your Body Assessment history.',
    ],
  },
];

type CaptureRecord = {
  captureId: string;
  step: CaptureStepConfig;
  previewUrl: string;
};

type Phase = 'welcome' | 'intro' | 'capture' | 'review' | 'submitting' | 'error';

function extensionFor(mediaType: 'image' | 'video'): string {
  return mediaType === 'image' ? 'jpg' : 'webm';
}

export function AssessmentWizard({ assessmentType }: { assessmentType: BodyAssessmentType }) {
  const router = useRouter();
  const typeConfig = getAssessmentTypeConfig(assessmentType);

  const [phase, setPhase] = useState<Phase>('welcome');
  const [introIndex, setIntroIndex] = useState(0);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [captureIndex, setCaptureIndex] = useState(0);
  const [records, setRecords] = useState<CaptureRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function ensureAssessment(): Promise<string | null> {
    if (assessmentId) return assessmentId;
    const result = await startAssessmentAction(assessmentType);
    if (result.error || !result.assessment) {
      setErrorMessage(result.error ?? 'Could not start this assessment.');
      setPhase('error');
      return null;
    }
    setAssessmentId(result.assessment.id);
    return result.assessment.id;
  }

  async function handleCaptured(step: CaptureStepConfig, media: CapturedMedia) {
    setBusy(true);
    setErrorMessage(null);
    try {
      const currentAssessmentId = await ensureAssessment();
      if (!currentAssessmentId) return;

      const captureId = crypto.randomUUID();
      const extension = extensionFor(step.mediaType);
      const target = await buildCaptureUploadPathAction(currentAssessmentId, captureId, extension);
      if (!target) throw new Error('Could not prepare upload.');

      const browserClient = createClient();
      const { error: uploadError } = await browserClient.storage
        .from(target.bucket)
        .upload(target.path, media.blob, {
          contentType: step.mediaType === 'image' ? 'image/jpeg' : 'video/webm',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const result = await recordCaptureAction({
        captureId,
        assessmentId: currentAssessmentId,
        captureType: step.captureType,
        sequenceIndex: captureIndex,
        mediaType: step.mediaType,
        storagePath: target.path,
        ...(media.width != null ? { width: media.width } : {}),
        ...(media.height != null ? { height: media.height } : {}),
        ...(media.durationSeconds != null ? { durationSeconds: media.durationSeconds } : {}),
      });
      if (result.error) throw new Error(result.error);

      // Best-effort, same discipline as submitAssessmentAction's AI/
      // analysis calls below it: the member's capture has already
      // succeeded above and must never be rolled back or blocked by
      // these — an on-device screening estimate failing to save is a
      // real gap for the coach's later review, not something the member
      // should have to retry the whole capture over.
      if (media.landmarks && media.landmarks.length > 0) {
        try {
          await recordLandmarkSetAction({
            assessmentId: currentAssessmentId,
            captureId,
            landmarks: media.landmarks,
            modelVersion: POSE_MODEL_VERSION,
          });
        } catch (landmarkError) {
          console.error('Could not save posture landmarks', landmarkError);
        }
      }

      if (media.postureEstimates && media.postureEstimates.length > 0) {
        try {
          await recordPostureFindingsAction(
            media.postureEstimates.map((estimate) => ({
              assessmentId: currentAssessmentId,
              captureId,
              findingType: estimate.findingType,
              side: estimate.side,
              severity: estimate.severity,
              confidence: estimate.confidence,
              narrative: estimate.narrative,
              landmarksUsed: estimate.landmarksUsed,
            }))
          );
        } catch (findingError) {
          console.error('Could not save posture findings', findingError);
        }
      }

      setRecords((prev) => [
        ...prev,
        { captureId, step, previewUrl: URL.createObjectURL(media.blob) },
      ]);

      if (captureIndex + 1 < typeConfig.captureSteps.length) {
        setCaptureIndex((i) => i + 1);
      } else {
        setPhase('review');
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong saving that capture.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRetake(record: CaptureRecord) {
    setBusy(true);
    setErrorMessage(null);
    try {
      await deleteCaptureAction(record.captureId);
      URL.revokeObjectURL(record.previewUrl);
      setRecords((prev) => prev.filter((r) => r.captureId !== record.captureId));
      const idx = typeConfig.captureSteps.findIndex((s) => s === record.step);
      setCaptureIndex(idx >= 0 ? idx : 0);
      setPhase('capture');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!assessmentId) return;
    setPhase('submitting');
    setErrorMessage(null);
    const result = await submitAssessmentAction(assessmentId);
    if (result.error) {
      // Submission itself still succeeds even when this error fires (it's
      // the best-effort "no analysis provider configured yet" message) —
      // proceed to results regardless, same as the milestone's "framework
      // works end-to-end without a provider" requirement.
      console.warn('Body assessment submitted; analysis not yet available:', result.error);
    }
    router.push(`/assessment/${assessmentId}`);
  }

  // ---- Welcome ----
  if (phase === 'welcome') {
    return (
      <div className={`${CARD} p-8 text-center`}>
        <Sparkles className="mx-auto h-8 w-8 text-[#854D0E]" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
          {typeConfig.label} Assessment
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[#6B7A72]">{typeConfig.description}</p>
        <p className="mt-2 text-xs text-[#9AA79F]">
          About {typeConfig.estimatedMinutes} minute{typeConfig.estimatedMinutes === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => {
            // Fire-and-forget: iOS Safari's device-orientation permission
            // prompt only works from within a genuine user-gesture
            // handler like this one — the camera step itself is reached
            // several taps later, too late for that requirement.
            void requestDeviceTiltPermission();
            setPhase('intro');
          }}
          className="mt-6 rounded-full bg-[#1B3A2D] px-8 py-3 text-sm font-medium text-white hover:brightness-110"
        >
          Begin
        </button>
      </div>
    );
  }

  // ---- Intro sequence: preparation / lighting / camera positioning / clothing / privacy ----
  if (phase === 'intro') {
    const step = INTRO_STEPS[introIndex]!;
    const Icon = step.icon;
    return (
      <div className={`${CARD} p-8`}>
        <Icon className="h-7 w-7 text-[#854D0E]" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
          {step.title}
        </h2>
        <div className="mt-3 space-y-2">
          {step.body.map((line) => (
            <p key={line} className="text-[15px] leading-relaxed text-[#6B7A72]">
              {line}
            </p>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {INTRO_STEPS.map((s, i) => (
              <span
                key={s.key}
                className={`h-1.5 w-6 rounded-full ${i <= introIndex ? 'bg-[#1B3A2D]' : 'bg-[#1B3A2D]/10'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (introIndex + 1 < INTRO_STEPS.length) setIntroIndex((i) => i + 1);
              else setPhase('capture');
            }}
            className="rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-medium text-white hover:brightness-110"
          >
            {introIndex + 1 < INTRO_STEPS.length ? 'Next' : "Let's go"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Capture steps ----
  if (phase === 'capture') {
    const step = typeConfig.captureSteps[captureIndex]!;
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            {step.title}
          </p>
          <p className="text-xs text-[#9AA79F]">
            Step {captureIndex + 1} of {typeConfig.captureSteps.length}
          </p>
        </div>
        {busy ? (
          <div className={`${CARD} flex flex-col items-center gap-3 p-10`}>
            <Loader2 className="h-6 w-6 animate-spin text-[#1B3A2D]" aria-hidden="true" />
            <p className="text-sm text-[#6B7A72]">Saving your capture…</p>
          </div>
        ) : (
          <CameraCapture step={step} onCaptured={(media) => handleCaptured(step, media)} />
        )}
        {errorMessage && <p className="mt-3 text-sm text-red-700">{errorMessage}</p>}
      </div>
    );
  }

  // ---- Review ----
  if (phase === 'review') {
    return (
      <div className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#854D0E]">
          <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Review your captures</p>
        </div>
        <p className="mt-2 text-sm text-[#6B7A72]">
          Everything looks good? Submit when ready, or retake anything below.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {records.map((record) => (
            <div key={record.captureId} className="overflow-hidden rounded-2xl bg-[#FAFAF8]">
              <div className="aspect-square w-full bg-black/5">
                {record.step.mediaType === 'video' ? (
                  <video src={record.previewUrl} className="h-full w-full object-cover" muted />
                ) : (
                  <img
                    src={record.previewUrl}
                    alt={record.step.title}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="truncate text-xs font-medium text-[#1B3A2D]">
                  {record.step.title}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRetake(record)}
                  title="Retake"
                  className="rounded-full p-1 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/10 hover:text-[#1B3A2D]"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {errorMessage && <p className="mt-3 text-sm text-red-700">{errorMessage}</p>}

        <button
          type="button"
          disabled={busy || records.length === 0}
          onClick={handleSubmit}
          className="mt-5 w-full rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          Submit assessment
        </button>
      </div>
    );
  }

  // ---- Submitting / processing ----
  if (phase === 'submitting') {
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 p-10 text-center`}>
        <Loader2 className="h-7 w-7 animate-spin text-[#1B3A2D]" aria-hidden="true" />
        <p className="text-sm font-medium text-[#1B3A2D]">Submitting your assessment…</p>
        <p className="text-xs text-[#6B7A72]">Preparing your results.</p>
      </div>
    );
  }

  // ---- Error ----
  return (
    <div className={`${CARD} p-8 text-center`}>
      <Trash2 className="mx-auto h-6 w-6 text-red-600" strokeWidth={1.5} aria-hidden="true" />
      <p className="mt-3 text-sm text-[#1B3A2D]">
        {errorMessage ?? 'Something went wrong starting this assessment.'}
      </p>
      <button
        type="button"
        onClick={() => setPhase('welcome')}
        className="mt-4 rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-medium text-white hover:brightness-110"
      >
        Try again
      </button>
    </div>
  );
}
