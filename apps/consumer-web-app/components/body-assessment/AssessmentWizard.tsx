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

import { useEffect, useState } from 'react';
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
  Compass,
  Volume2,
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
  getMostRecentCaptureSetupAction,
  getMyAssessmentsAction,
  getAssessmentDetailAction,
  getSignedCaptureUrlAction,
  type CaptureSetupTarget,
} from '@/app/actions/body-assessment';
import { CameraCapture, type CapturedMedia } from './CameraCapture';
import {
  requestDeviceTiltPermission,
  type OrientationPermissionStatus,
} from '@/hooks/useDeviceTilt';
import { useGuidedVoice } from '@/hooks/useGuidedVoice';
import { POSE_MODEL_VERSION } from '@/hooks/usePoseLandmarker';
import { primeBrowserSpeechSynthesis } from '@/lib/speech/browserTextToSpeech';
import { POSTURE_THRESHOLDS_VERSION } from '@/lib/body-assessment/postureMeasurements';
import { CenterStage, Card } from '@/components/layout';

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
      'You can pause and retake any capture. Nothing is final until you review and submit.',
    ],
  },
  {
    key: 'lighting',
    title: 'Lighting',
    icon: Sun,
    body: [
      'Find a well-lit room: natural daylight or a bright overhead light works well.',
      'Avoid strong backlighting (like standing in front of a window). It can make you hard to see.',
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
  /**
   * Same id CameraCapture.tsx's own useGuidedVoice instance uses — sharing
   * the id (and the underlying playbackRegistry/browser provider) means a
   * confirmation spoken here from this prep screen and the camera step's
   * own guidance never talk over each other. The member stands too far
   * from the phone to read on-screen text once the camera step starts, so
   * this is a real, audible, tap-triggered check — not just priming — done
   * early enough that a silent phone (volume down, silent switch) gets
   * caught here rather than discovered mid-assessment.
   */
  const guidedVoice = useGuidedVoice('assessment-guidance');

  const [phase, setPhase] = useState<Phase>('welcome');
  const [introIndex, setIntroIndex] = useState(0);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [captureIndex, setCaptureIndex] = useState(0);
  const [records, setRecords] = useState<CaptureRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** The outcome of the camera_positioning prep screen's explicit motion-sensor permission request — passed to CameraCapture so it knows whether to wait for a live sensor reading or go straight to the manual bubble-level fallback. */
  const [orientationPermission, setOrientationPermission] =
    useState<OrientationPermissionStatus>('pending');
  /** The setup (roll/pitch/hip position/frame fill) to guide the current capture step's live reading toward, fetched fresh whenever the capture step changes — null for movement/video steps and for a member's first-ever capture of a given view. */
  const [replicationTarget, setReplicationTarget] = useState<CaptureSetupTarget | null>(null);
  /** True only while checking for a resumable in-progress assessment on mount — kept brief and unrendered (a blank beat) rather than flashing the welcome screen and then jumping away from it a moment later. */
  const [checkingResume, setCheckingResume] = useState(true);

  // On mount, check for an assessment of this exact type the member already
  // started but never submitted (e.g. exited mid-flow via the camera
  // screen's close button — see CameraCapture.tsx's onExit) and resume it
  // rather than starting a brand-new one: same assessmentId, already-
  // captured steps skipped, landing on the first uncaptured step (or
  // Review, if every step is already captured). This is what keeps an
  // abandoned assessment from becoming an orphaned, ever-accumulating
  // 'in_progress' row every time the member starts this assessment type
  // again — there is always at most one in-progress row per type, either
  // continued here or left for a coach/future pass to see, never silently
  // duplicated.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await getMyAssessmentsAction(assessmentType);
      const inProgress = existing.find((a) => a.status === 'in_progress');
      if (!inProgress) {
        if (!cancelled) setCheckingResume(false);
        return;
      }
      const detail = await getAssessmentDetailAction(inProgress.id);
      if (cancelled) return;
      if (!detail) {
        setCheckingResume(false);
        return;
      }

      const resumedRecords: CaptureRecord[] = [];
      for (const capture of detail.captures) {
        const matchedStep = typeConfig.captureSteps.find(
          (s) => s.captureType === capture.capture_type
        );
        if (!matchedStep) continue;
        const url = await getSignedCaptureUrlAction(capture.storage_path);
        if (cancelled) return;
        if (url) resumedRecords.push({ captureId: capture.id, step: matchedStep, previewUrl: url });
      }

      const capturedTypes = new Set(resumedRecords.map((r) => r.step.captureType));
      const nextIndex = typeConfig.captureSteps.findIndex(
        (s) => !capturedTypes.has(s.captureType)
      );

      setAssessmentId(inProgress.id);
      setRecords(resumedRecords);
      if (nextIndex === -1) {
        setPhase('review');
      } else {
        setCaptureIndex(nextIndex);
        setPhase('capture');
      }
      setCheckingResume(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally runs once on mount only — assessmentType/typeConfig are
    // fixed for the lifetime of this component instance (a prop), and
    // re-running this on every render would fight the wizard's own state
    // transitions once resume (or a fresh start) has already happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch this step's guided-replication target fresh whenever the capture
  // step changes — only standing-photo steps (front/left_side/right_side/
  // back) ran the reproducibility gate in the first place, so a movement/
  // video step never has (or needs) a target.
  useEffect(() => {
    if (phase !== 'capture') return;
    const step = typeConfig.captureSteps[captureIndex];
    if (!step || step.mediaType === 'video') {
      setReplicationTarget(null);
      return;
    }
    let cancelled = false;
    getMostRecentCaptureSetupAction(step.captureType).then((target) => {
      if (!cancelled) setReplicationTarget(target);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, captureIndex, typeConfig.captureSteps]);

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
        ...(media.deviceInfo ? { deviceInfo: media.deviceInfo } : {}),
        ...(media.cameraTilt ? { cameraTilt: media.cameraTilt } : {}),
        ...(media.validationSummary ? { validationSummary: media.validationSummary } : {}),
        ...(media.rollDegrees !== undefined ? { rollDegrees: media.rollDegrees } : {}),
        ...(media.pitchDegrees !== undefined ? { pitchDegrees: media.pitchDegrees } : {}),
        ...(media.hipMidYRatio !== undefined ? { hipMidYRatio: media.hipMidYRatio } : {}),
        ...(media.subjectFrameHeightRatio !== undefined
          ? { subjectFrameHeightRatio: media.subjectFrameHeightRatio }
          : {}),
        ...(media.orientationSource ? { orientationSource: media.orientationSource } : {}),
        // Silhouette spinal curve (migration 160) — side-view photos only,
        // and each field only when it was actually measured. Passed through
        // exactly as received: an angle the camera step withheld for low
        // confidence must stay withheld here, never defaulted to a number.
        ...(media.thoracicAngleDegrees !== undefined
          ? {
              thoracicAngleDegrees: media.thoracicAngleDegrees,
              thoracicAngleConfidence: media.thoracicAngleConfidence,
            }
          : {}),
        ...(media.lumbarAngleDegrees !== undefined
          ? {
              lumbarAngleDegrees: media.lumbarAngleDegrees,
              lumbarAngleConfidence: media.lumbarAngleConfidence,
            }
          : {}),
        ...(media.spinalCurveQuality ? { spinalCurveQuality: media.spinalCurveQuality } : {}),
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
              thresholdConfigVersion: POSTURE_THRESHOLDS_VERSION,
              rawValue: estimate.value,
              unit: estimate.unit,
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

  /**
   * The camera screen's visible close control, and the fallback destination
   * if the browser/hardware back button is used mid-flow — same target as
   * this page's own header "Back" link (app/assessment/new/page.tsx), so
   * every way out of this screen lands somewhere consistent. Deliberately
   * does NOT touch the in-progress assessment row: the resume effect above
   * is what keeps returning here from leaving a stuck/duplicated record,
   * not anything done at exit time.
   */
  function handleExit() {
    router.push('/assessment');
  }

  if (checkingResume) {
    return (
      <CenterStage>
        <Card className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#1B3A2D]" aria-hidden="true" />
          <p className="text-sm text-[#6B7A72]">Checking for where you left off...</p>
        </Card>
      </CenterStage>
    );
  }

  // ---- Welcome ----
  if (phase === 'welcome') {
    return (
      <CenterStage>
        <Card className="text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[#6B7A72]" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
            {typeConfig.label} Assessment
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#4F645A]">{typeConfig.description}</p>
          <p className="mt-2 text-xs text-[#9AA79F]">
            About {typeConfig.estimatedMinutes} minute{typeConfig.estimatedMinutes === 1 ? '' : 's'}
          </p>
          <button
            type="button"
            onClick={() => {
              // Fire-and-forget: the speechSynthesis mobile-autoplay unlock
              // only works from within a genuine user-gesture handler like
              // this one — the camera step itself is reached several taps
              // later, too late for that requirement. See
              // primeBrowserSpeechSynthesis()'s docblock; CameraCapture's
              // voice guidance still detects and recovers from a blocked
              // state on its own if this priming attempt doesn't hold. The
              // device-orientation permission request itself now happens
              // explicitly on the camera_positioning prep screen below, with
              // a plain-language explanation, rather than silently here.
              primeBrowserSpeechSynthesis();
              setPhase('intro');
            }}
            className="mt-6 rounded-full bg-[#1B3A2D] px-8 py-3 text-sm font-medium text-white hover:brightness-110"
          >
            Begin
          </button>
        </Card>
      </CenterStage>
    );
  }

  // ---- Intro sequence: preparation / lighting / camera positioning / clothing / privacy ----
  if (phase === 'intro') {
    const step = INTRO_STEPS[introIndex]!;
    const Icon = step.icon;
    return (
      <CenterStage>
      <Card>
        <Icon className="h-7 w-7 text-[#6B7A72]" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
          {step.title}
        </h2>
        <div className="mt-3 space-y-2">
          {step.body.map((line) => (
            <p key={line} className="text-[15px] leading-relaxed text-[#4F645A]">
              {line}
            </p>
          ))}
        </div>

        {step.key === 'preparation' && (
          <div className="mt-4 rounded-2xl bg-[#FAFAF8] p-4">
            <div className="flex items-start gap-2.5">
              <Volume2
                className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className="text-[13px] leading-relaxed text-[#6B7A72]">
                You&apos;ll be standing well back from the phone once the photos begin, too far to
                read on-screen text, so we guide you mostly out loud. Tap below to turn on voice
                guidance and confirm you can hear it now, before you&apos;re across the room.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                guidedVoice.speak(
                  "Voice guidance is ready. You'll hear spoken directions throughout your photos."
                )
              }
              className="mt-3 w-full rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"
            >
              {guidedVoice.status === 'unlocked' ? 'Play voice guidance again' : 'Enable voice guidance'}
            </button>
            {guidedVoice.status === 'unlocked' && (
              <p className="mt-3 text-[13px] font-medium text-[#1B3A2D]">
                Voice guidance is working. You should have just heard it.
              </p>
            )}
            {guidedVoice.status === 'blocked' && (
              <p className="mt-3 text-[13px] font-medium text-[#1B3A2D]">
                We couldn&apos;t confirm audio played: check your volume and silent/mute switch,
                then tap the button again. You can still follow the on-screen text either way.
              </p>
            )}
            {guidedVoice.status === 'unavailable' && (
              <p className="mt-3 text-[13px] font-medium text-[#1B3A2D]">
                Voice guidance isn&apos;t available on this browser. Follow the on-screen text
                instead.
              </p>
            )}
          </div>
        )}

        {step.key === 'camera_positioning' && (
          <div className="mt-4 rounded-2xl bg-[#FAFAF8] p-4">
            <div className="flex items-start gap-2.5">
              <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-[13px] leading-relaxed text-[#6B7A72]">
                Every angle we measure depends on your phone being in the exact same position every
                time, so we ask for access to your phone&apos;s motion sensors: this lets us
                confirm it&apos;s level and at the right height before each photo, so your results
                are truly comparable over time.
              </p>
            </div>
            {orientationPermission === 'pending' ? (
              <button
                type="button"
                onClick={async () => {
                  const result = await requestDeviceTiltPermission();
                  setOrientationPermission(result);
                }}
                className="mt-3 w-full rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"
              >
                Allow motion &amp; orientation access
              </button>
            ) : (
              <p className="mt-3 text-[13px] font-medium text-[#1B3A2D]">
                {orientationPermission === 'granted' &&
                  'Motion access enabled. We’ll guide you to hold the phone steady.'}
                {orientationPermission === 'not_required' &&
                  'Your browser shares motion data automatically. We’ll guide you to hold the phone steady.'}
                {(orientationPermission === 'denied' || orientationPermission === 'unavailable') &&
                  'No problem, we’ll show you an on-screen level guide to confirm by hand instead.'}
              </p>
            )}
          </div>
        )}

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
      </Card>
      </CenterStage>
    );
  }

  // ---- Capture steps ----
  if (phase === 'capture') {
    const step = typeConfig.captureSteps[captureIndex]!;
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            {step.title}
          </p>
          <p className="text-xs text-[#9AA79F]">
            Step {captureIndex + 1} of {typeConfig.captureSteps.length}
          </p>
        </div>
        {busy ? (
          <Card className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[#1B3A2D]" aria-hidden="true" />
            <p className="text-sm text-[#6B7A72]">Saving your capture…</p>
          </Card>
        ) : (
          <CameraCapture
            step={step}
            onCaptured={(media) => handleCaptured(step, media)}
            replicationTarget={replicationTarget}
            orientationPermission={orientationPermission}
            onExit={handleExit}
          />
        )}
        {errorMessage && <p className="mt-3 text-sm text-red-700">{errorMessage}</p>}
      </div>
    );
  }

  // ---- Review ----
  if (phase === 'review') {
    return (
      <Card>
        <div className="flex items-center gap-2 text-[#6B7A72]">
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
      </Card>
    );
  }

  // ---- Submitting / processing ----
  if (phase === 'submitting') {
    return (
      <CenterStage>
        <Card className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#1B3A2D]" aria-hidden="true" />
          <p className="text-sm font-medium text-[#1B3A2D]">Submitting your assessment…</p>
          <p className="text-xs text-[#6B7A72]">Preparing your results.</p>
        </Card>
      </CenterStage>
    );
  }

  // ---- Error ----
  return (
    <CenterStage>
      <Card className="text-center">
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
      </Card>
    </CenterStage>
  );
}
