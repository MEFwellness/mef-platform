'use client';

/**
 * The complete camera capture workflow for one guided-assessment step.
 * Pure browser APIs, no camera library dependency, plus (for image/photo
 * steps only) on-device pose validation via hooks/usePoseLandmarker.ts —
 * MediaPipe Pose Landmarker running fully client-side, no server round
 * trip. lib/body-assessment/poseValidation.ts decides, frame by frame,
 * whether the member is a single, clearly-visible, correctly-framed,
 * correctly-oriented, standing person; this component turns that verdict
 * into a controlled voice-guidance cadence (lib/body-assessment/
 * voiceGuidanceMachine.ts), a live PoseOverlay, a status indicator, and a
 * stability timer that gates when a photo may actually be taken — and,
 * once captured, computes the estimated posture measurements
 * (lib/body-assessment/postureMeasurements.ts) from that exact frame's
 * landmarks for AssessmentWizard to persist.
 *
 * Movement/video steps (walking, squat, shoulder mobility, etc.) are
 * unchanged from before — this validator only applies to static standing
 * photo steps, which is the one the platform got wrong (capturing a
 * seated member for an assessment that required standing).
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, SwitchCamera, Video, CircleStop, Volume2, VolumeX, Ear } from 'lucide-react';
import type { CaptureStepConfig } from '@/lib/body-assessment/assessmentTypes';
import type { BodyLandmarkPoint } from '@mef/shared-types-contracts';
import { usePoseLandmarker } from '@/hooks/usePoseLandmarker';
import { useGuidedVoice } from '@/hooks/useGuidedVoice';
import { useDeviceTilt } from '@/hooks/useDeviceTilt';
import {
  validatePoseFrame,
  evaluateMultiPersonCandidate,
  type PoseValidationResult,
} from '@/lib/body-assessment/poseValidation';
import { evaluateCameraTilt } from '@/lib/body-assessment/cameraTilt';
import { computeFrameQualityStats, evaluateFrameQuality, type FrameQualityResult } from '@/lib/body-assessment/frameQuality';
import { triggerHaptic, HAPTIC_PATTERNS } from '@/lib/body-assessment/haptics';
import {
  stepTemporalSignal,
  isTemporalSignalPending,
  INITIAL_TEMPORAL_SIGNAL_STATE,
  type TemporalSignalState,
} from '@/lib/body-assessment/temporalSignal';
import {
  CAMERA_SETUP_INTRO,
  CAPTURE_STATUS_LABEL,
  READY_PROMPT,
  TAKING_PHOTO_PROMPT,
  TRACKING_BRIEFLY_LOST_PROMPT,
  TRACKING_LOST_PROMPT,
  spokenMessageFor,
} from '@/lib/body-assessment/voiceGuidance';
import {
  stepGuidance,
  markSpeechStarted,
  markSpeechEnded,
  resetGuidanceMemory,
  type GuidanceMemory,
} from '@/lib/body-assessment/voiceGuidanceMachine';
import { toBodyLandmarkPoints } from '@/lib/body-assessment/landmarkMapping';
import { computePostureEstimates, type PostureEstimate } from '@/lib/body-assessment/postureMeasurements';
import { computePelvicDropScreening, type PelvicDropSample } from '@/lib/body-assessment/pelvicDropScreening';
import { toCoreLandmarks } from '@/lib/body-assessment/poseTypes';
import { computePoseMetrics, type Point } from '@/lib/body-assessment/poseMetrics';
import { PoseOverlay, type AngleLabel, type OverlayTone } from './PoseOverlay';
import { CaptureCountdown } from './CaptureCountdown';
import { CaptureCountdownNumeral } from './CaptureCountdownNumeral';
import { CaptureFlash } from './CaptureFlash';
import { ScanSweep } from './ScanSweep';
import { InitializationOverlay, type InitializationStage } from './InitializationOverlay';

export type CapturedMedia = {
  blob: Blob;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Present only for a validated standing-photo capture — the exact frame's landmarks, mapped for storage. */
  landmarks?: BodyLandmarkPoint[];
  /** Present only for a validated standing-photo capture — screening estimates computed from the same frame. */
  postureEstimates?: PostureEstimate[];
  /** The device-orientation reading at the moment of capture — persisted so a practitioner can see whether a distorted shot was a phone-angle artifact rather than a real postural finding. Omitted entirely when useDeviceTilt never resolved a reading (e.g. desktop browsers, permission denied) — matches @mef/shared-types-contracts' CameraTiltReading, which requires both numbers. */
  cameraTilt?: { gamma: number; beta: number };
  /** Coarse, non-fingerprinting device context — just enough to explain a low-quality capture after the fact (e.g. "recorded on a small/older device"), never used for tracking. Shape matches @mef/shared-types-contracts' CaptureDeviceInfo (string-valued fields only). */
  deviceInfo?: { userAgent: string; platform: string; screenSize: string; pixelRatio: string };
  /** How many frames failed each validation category, and how many confirmed multi-person events occurred, during this step's positioning — a session summary, not a full per-frame log. */
  validationSummary?: { categoryFailureCounts: Record<string, number>; multiPersonEvents: number };
};

type Props = {
  step: CaptureStepConfig;
  onCaptured: (media: CapturedMedia) => void;
};

type CameraPhase = 'requesting' | 'ready' | 'recording' | 'analyzing' | 'preview' | 'denied' | 'unsupported';

/** How long a valid, stable pose must hold before the final capture countdown begins — separate from voice-guidance timing (which governs how often we SPEAK, not when we capture). */
const REQUIRED_STABLE_MS = 1750;
/** A calm, visible 3-2-1 before the shutter actually fires, once REQUIRED_STABLE_MS has already been satisfied — real elapsed time, not a fake delay layered on top of already-real stability. */
const COUNTDOWN_MS = 3000;
/** "Alignment captured" confirmation beat, immediately after the shutter fires. */
const CAPTURED_CONFIRM_MS = 500;
/** "Analyzing alignment…" beat that follows — the computation itself is near-instant (pure arithmetic on landmarks already in memory), so this is a UX pacing choice, not processing time. */
const ANALYZING_DISPLAY_MS = 550;

/** How long a second-person candidate must persist, unbroken, before it's actually spoken as a warning — filters single-frame duplicate/ghost-detection artifacts (see poseValidation.ts's evaluateMultiPersonCandidate docblock). */
const MULTI_PERSON_CONFIRM_MS = 900;
/** Hysteresis so a single clean frame in the middle of a real multi-person event doesn't immediately clear a just-confirmed warning and re-trigger it a moment later. */
const MULTI_PERSON_RELEASE_MS = 700;
/** How long a pose-detection gap must persist before it's worth mentioning at all — a single missed frame during normal tracking is not "you left the frame." */
const PERSON_LOST_CONFIRM_MS = 450;
/** Beyond this, "briefly lost" no longer applies and the messaging switches to the more directive "step into the frame." */
const PERSON_LOST_LONG_MS = 3000;
const PERSON_LOST_RELEASE_MS = 200;
/** A single failing frame in the middle of an already-stable hold is absorbed without resetting accumulated stability — MediaPipe has occasional single-frame misses even for a genuinely still, correctly-positioned member; only a failure that persists past this counts as a real interruption. */
const STABILITY_GRACE_MS = 400;

const NOT_READY_STATUSES = new Set(['no_person', 'multiple_people', 'low_confidence', 'tracking_lost_brief', 'tracking_lost_long']);

const ACKNOWLEDGMENTS = ['Good.', 'Perfect.', 'Great.', 'Nice.'];
/** Keys that represent a NEW problem arising rather than the natural next fix in a sequence — never prefixed with a "good job" acknowledgment, since nothing was actually resolved into these. */
const SKIP_ACKNOWLEDGMENT_KEYS = new Set(['multiple_people', 'tracking_lost_brief', 'tracking_lost_long', 'subject_changed', 'no_person']);

function pickAcknowledgment(): string {
  return ACKNOWLEDGMENTS[Math.floor(Math.random() * ACKNOWLEDGMENTS.length)]!;
}

/** The "nothing resolved yet" PoseValidationResult — used both as initial state and on every step transition. Kept as one function so the full structured-result shape (poseValidation.ts) only needs updating in one place here. */
function emptyValidationResult(): PoseValidationResult {
  return {
    status: 'no_person',
    category: 'person_detection',
    ok: false,
    message: '',
    spokenMessage: '',
    severity: 'blocking',
    confidence: 0,
    blocksCapture: true,
    resetsStabilityHold: true,
    practitionerReviewRecommended: false,
    correctionTarget: 'frame',
    metrics: null,
    core: null,
    rawPoints: null,
  };
}

function SilhouetteGuide({ wide, tone }: { wide: boolean; tone: OverlayTone }) {
  const stroke = tone === 'success' ? '#34D399' : tone === 'warning' ? '#FBBF24' : 'white';
  return (
    <svg
      viewBox="0 0 200 400"
      className={`pointer-events-none absolute inset-0 mx-auto h-full ${wide ? 'w-full' : 'w-2/3'} opacity-40 transition-colors`}
      aria-hidden="true"
    >
      {wide ? (
        <rect x="10" y="40" width="180" height="320" rx="16" fill="none" stroke={stroke} strokeWidth="3" strokeDasharray="10 8" />
      ) : (
        // Roughly 8-head-height adult proportions: head, shoulders (~0.26H
        // wide), waist, hips (~0.19H wide), knees, ankles — a realistic
        // standing outline rather than a generic blob, so "stand inside
        // the outline" actually corresponds to a believable stance.
        <g fill="none" stroke={stroke} strokeWidth="3" strokeDasharray="8 6" strokeLinejoin="round">
          <circle cx="100" cy="35" r="28" />
          <path d="M48 100 Q45 160 62 200 L58 300 L55 388 M152 100 Q155 160 138 200 L142 300 L145 388" />
          <path d="M48 100 Q100 82 152 100" />
          <path d="M62 200 L138 200" />
          <path d="M58 300 L142 300" />
          <path d="M48 100 L30 190" />
          <path d="M152 100 L170 190" />
        </g>
      )}
    </svg>
  );
}

export function CameraCapture({ step, onCaptured }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<CameraPhase>('requesting');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [instructionIndex, setInstructionIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(step.durationSeconds ?? 0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<CapturedMedia | null>(null);

  const [validation, setValidation] = useState<PoseValidationResult>(emptyValidationResult());
  const [stableForMs, setStableForMs] = useState(0);
  const [autoCaptureTriggered, setAutoCaptureTriggered] = useState(false);
  const [screenLine, setScreenLine] = useState('');
  /** The frozen frame (landmarks + metrics) the capture actually fired on — what the preview overlay and the persisted measurements are both built from. */
  const [frozenValidation, setFrozenValidation] = useState<PoseValidationResult | null>(null);
  /** Non-null only during the final visible 3-2-1 before the shutter fires — see COUNTDOWN_MS. */
  const [countdownRemainingMs, setCountdownRemainingMs] = useState<number | null>(null);
  /** Mirrors the temporally-confirmed multi-person/tracking-loss verdict computed inside the validation effect, so render (status chip, screen line, silhouette tone) can reflect it too — validation.status alone only ever reflects a single frame's opinion on the CHOSEN subject, never the separate continuity layer. */
  const [continuityOverride, setContinuityOverride] = useState<{ key: string; message: string } | null>(null);
  /** Which beat of the post-capture moment is showing — "Alignment captured" then "Analyzing alignment…", both over the same frozen frame. */
  const [analyzingSubphase, setAnalyzingSubphase] = useState<'captured' | 'analyzing'>('captured');

  const readySinceRef = useRef<number | null>(null);
  const introQueueStartedRef = useRef(false);
  /** The full intro script for the current step and where the chain has gotten to — refs (not closure locals) specifically so the "tap to enable voice" banner can resume the exact same chain from outside the effect that started it. */
  const introLinesRef = useRef<string[]>([]);
  const introIndexRef = useRef(0);
  /** Bumped whenever the step changes, invalidating any in-flight intro chain from a previous step (replaces the old effect-closure `cancelled` flag, which a ref-based resumable chain can't rely on). */
  const introGenerationRef = useRef(0);
  const autoCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guidanceMemoryRef = useRef<GuidanceMemory>(resetGuidanceMemory());
  /** Hip-line-angle samples collected during a tracksPelvicDrop recording — see pelvicDropScreening.ts's docblock for exactly what this passive analysis does and doesn't cover. */
  const pelvicSamplesRef = useRef<PelvicDropSample[]>([]);
  /** The confident subject's hip midpoint from the last mid-hold frame — see poseValidation.ts's previousSubjectCenter docblock. Only populated/consulted while readySinceRef is active. */
  const subjectCenterRef = useRef<Point | null>(null);
  /** Tracks whether the previous frame was locked (result.ok && tilt.ok && frameQuality.ok, plus no confirmed/pending second person) so the lock-acquired haptic fires once on the rising edge, not every frame while held. */
  const wasLockedRef = useRef(false);
  const qualityCanvasRef = useRef<HTMLCanvasElement>(null);
  /** Confirm/release hysteresis over per-frame multi-person candidate signals — see poseValidation.ts's evaluateMultiPersonCandidate and temporalSignal.ts's docblocks for why a single frame is never enough evidence on its own. */
  const multiPersonStateRef = useRef<TemporalSignalState>(INITIAL_TEMPORAL_SIGNAL_STATE);
  /** Same hysteresis treatment for "no person detected," so a single missed detection frame doesn't read as "you left the frame." */
  const personLostStateRef = useRef<TemporalSignalState>(INITIAL_TEMPORAL_SIGNAL_STATE);
  /** When the current not-locked streak started, mid-hold — see STABILITY_GRACE_MS. Null whenever not mid-hold or currently locked. */
  const lockLostAtRef = useRef<number | null>(null);
  /** When the current stable hold crossed REQUIRED_STABLE_MS and the final visible countdown began — null before that point or after a genuine (past-grace) interruption. */
  const countdownStartRef = useRef<number | null>(null);
  /** The last problem key actually spoken aloud — lets the next, DIFFERENT correction open with a brief acknowledgment ("Good — now...") instead of jumping straight from one issue to the next with no sense of progress. */
  const lastResolvedProblemKeyRef = useRef<string | null>(null);
  /** The last whole-second countdown value a haptic tick fired for, so each second gets exactly one tick rather than one per animation frame. */
  const lastCountdownTickRef = useRef<number | null>(null);
  /** How many frames failed each validation category during this step's positioning — a lightweight session summary (not a full per-frame event log) persisted alongside the capture so a coach can see e.g. "framing was corrected 6 times, orientation once" instead of nothing at all. Reset on every step transition. */
  const validationFailureCountsRef = useRef<Record<string, number>>({});
  /** How many times a second-person candidate was CONFIRMED (not just a fleeting single-frame opinion) during this step. */
  const multiPersonEventCountRef = useRef(0);
  /** Rising-edge detector for the above — only count a confirmation once per occurrence, not once per frame it stays confirmed. */
  const wasMultiPersonConfirmedRef = useRef(false);

  const [frameQuality, setFrameQuality] = useState<FrameQualityResult>({ status: 'ready', ok: true, message: '' });

  const isVideo = step.mediaType === 'video';
  const requiresStanding = !isVideo;
  const tracksPelvicDrop = step.tracksPelvicDrop === true;
  const poseActive = (phase === 'ready' && requiresStanding) || (phase === 'recording' && tracksPelvicDrop);

  const { poses, isLoading: poseLoading, loadError: poseLoadError } = usePoseLandmarker(videoRef, poseActive);
  const guidedVoice = useGuidedVoice('assessment-guidance');
  const { gamma: tiltGamma, beta: tiltBeta } = useDeviceTilt(poseActive);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setPhase('unsupported');
        return;
      }
      setPhase('requesting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase('ready');
      } catch (err) {
        console.error('Camera access failed', err);
        setPhase('denied');
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  // Reset all step-scoped guidance state when moving to a new capture step
  // (step objects are stable module-level consts, so this only fires on an
  // actual step transition, not on every render).
  useEffect(() => {
    introQueueStartedRef.current = false;
    introGenerationRef.current += 1;
    introIndexRef.current = 0;
    readySinceRef.current = null;
    subjectCenterRef.current = null;
    wasLockedRef.current = false;
    multiPersonStateRef.current = INITIAL_TEMPORAL_SIGNAL_STATE;
    personLostStateRef.current = INITIAL_TEMPORAL_SIGNAL_STATE;
    lockLostAtRef.current = null;
    countdownStartRef.current = null;
    lastResolvedProblemKeyRef.current = null;
    lastCountdownTickRef.current = null;
    guidanceMemoryRef.current = resetGuidanceMemory();
    setAutoCaptureTriggered(false);
    setStableForMs(0);
    setCountdownRemainingMs(null);
    setContinuityOverride(null);
    setAnalyzingSubphase('captured');
    setValidation(emptyValidationResult());
    setFrameQuality({ status: 'ready', ok: true, message: '' });
    validationFailureCountsRef.current = {};
    multiPersonEventCountRef.current = 0;
    wasMultiPersonConfirmedRef.current = false;
    if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
  }, [step]);

  // Speak the fixed setup script once per step, one line at a time,
  // cancelling before each new line (useGuidedVoice's speak() always does
  // this) so instructions never stack on top of each other. This starts
  // automatically the moment the camera is ready — no tap required — and
  // is written against refs (not effect-closure locals) specifically so
  // handleEnableVoiceTap below can resume this exact same chain if the
  // very first automatic speak() call gets silently blocked by a mobile
  // autoplay policy (see useGuidedVoice.ts's docblock).
  function speakIntroLine(generation: number) {
    if (generation !== introGenerationRef.current) return;
    const lines = introLinesRef.current;
    const i = introIndexRef.current;
    if (i >= lines.length) return;
    const line = lines[i]!;
    introIndexRef.current = i + 1;
    setScreenLine(line);
    guidedVoice.speak(line, () => speakIntroLine(generation));
  }

  useEffect(() => {
    if (phase !== 'ready' || !requiresStanding || introQueueStartedRef.current) return;
    introQueueStartedRef.current = true;
    const generation = introGenerationRef.current;
    introLinesRef.current = [...CAMERA_SETUP_INTRO, ...step.instructions];
    introIndexRef.current = 0;
    speakIntroLine(generation);
  }, [phase, requiresStanding, step]);

  // The one-time "Tap once to enable voice guidance" recovery path: a real
  // gesture, so the speak() call it makes is guaranteed to actually play,
  // which both unlocks the engine for everything after (see
  // useGuidedVoice's confirmedUnlockedRef) and resumes the stalled intro
  // chain from the exact line that silently failed to play.
  function handleEnableVoiceTap() {
    const generation = introGenerationRef.current;
    if (introIndexRef.current > 0 && introIndexRef.current <= introLinesRef.current.length) {
      introIndexRef.current -= 1;
      speakIntroLine(generation);
    } else {
      guidedVoice.speak(currentScreenLine || screenLine || 'Voice guidance enabled.');
    }
  }

  // Cycle written guidance for movement/video steps only — photo steps get
  // their on-screen line from the voice queue / live validation instead.
  useEffect(() => {
    if (phase !== 'ready' || requiresStanding || step.instructions.length <= 1) return;
    const timer = setInterval(() => {
      setInstructionIndex((i) => (i + 1) % step.instructions.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [phase, requiresStanding, step.instructions.length]);

  // Frame-quality (blur/lighting) sampling — deliberately its own slow
  // interval, not every pose-detection frame: getImageData is comparably
  // expensive, and blur/lighting change on a much slower timescale than
  // landmark positions do. Standing-photo steps only, same scope as the
  // main validation effect below.
  useEffect(() => {
    if (!poseActive || !requiresStanding) return;
    const canvas = qualityCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const interval = setInterval(() => {
      if (video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, 64, 48);
        const imageData = ctx.getImageData(0, 0, 64, 48);
        const stats = computeFrameQualityStats(imageData);
        const result = evaluateFrameQuality(stats);
        if (process.env.NODE_ENV !== 'production') {
          // MIN_SHARPNESS_SCORE/MIN_MEAN_LUMINANCE in frameQuality.ts are
          // unvalidated placeholders (see that file's docblock) — these
          // raw numbers, gathered from a real device, are exactly what's
          // needed to tune them correctly.
          console.debug('[posture-guidance] frame-quality', { ...stats, status: result.status });
        }
        setFrameQuality(result);
      } catch {
        // Sampling is a screening enhancement, not a requirement — a
        // transient canvas read failure should never block capture.
      }
    }, 400);

    return () => clearInterval(interval);
  }, [poseActive, requiresStanding]);

  function capturePhoto(finalValidation: PoseValidationResult) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const core = finalValidation.core;
        const landmarks =
          core && finalValidation.rawPoints ? toBodyLandmarkPoints(finalValidation.rawPoints) : undefined;
        const postureEstimates = core ? computePostureEstimates(core, step.captureType) : undefined;
        const deviceInfo =
          typeof navigator !== 'undefined' && typeof screen !== 'undefined'
            ? {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                screenSize: `${screen.width}x${screen.height}`,
                pixelRatio: String(window.devicePixelRatio ?? 1),
              }
            : undefined;

        setFrozenValidation(finalValidation);
        setPendingMedia({
          blob,
          width: canvas.width,
          height: canvas.height,
          durationSeconds: null,
          ...(landmarks ? { landmarks } : {}),
          ...(postureEstimates ? { postureEstimates } : {}),
          ...(tiltGamma !== null && tiltBeta !== null ? { cameraTilt: { gamma: tiltGamma, beta: tiltBeta } } : {}),
          ...(deviceInfo ? { deviceInfo } : {}),
          validationSummary: {
            categoryFailureCounts: validationFailureCountsRef.current,
            multiPersonEvents: multiPersonEventCountRef.current,
          },
        });
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase('analyzing');
        setAnalyzingSubphase('captured');
        setTimeout(() => {
          setAnalyzingSubphase('analyzing');
          setTimeout(() => setPhase('preview'), ANALYZING_DISPLAY_MS);
        }, CAPTURED_CONFIRM_MS);
      },
      'image/jpeg',
      0.9
    );
  }

  // Live pose validation loop for standing photo steps: interpret the
  // latest frame, layer temporal continuity on top of it (multi-person
  // confirmation, brief-tracking-loss tolerance, stability-blip
  // tolerance), decide whether it counts toward the stability window, and
  // drive the voice-guidance state machine.
  useEffect(() => {
    if (!poseActive || !requiresStanding || poseLoading || poseLoadError || autoCaptureTriggered) return;

    const previousSubjectCenter = readySinceRef.current !== null ? subjectCenterRef.current : null;
    const result = validatePoseFrame(poses ?? [], {
      requiresStanding,
      captureType: step.captureType,
      previousSubjectCenter,
    });
    setValidation(result);
    subjectCenterRef.current = result.metrics?.hipMid ?? null;
    if (!result.ok) {
      validationFailureCountsRef.current[result.category] = (validationFailureCountsRef.current[result.category] ?? 0) + 1;
    }

    const now = Date.now();

    // Multi-person: a single frame's spatial-separation-aware opinion
    // (evaluateMultiPersonCandidate), fed through confirm/release
    // hysteresis — never act on one frame alone. See both functions'
    // docblocks for exactly why (duplicate/ghost detections of the SAME
    // person are the dominant real-world false positive this replaces).
    const multiPersonCandidate =
      result.core && result.metrics
        ? evaluateMultiPersonCandidate(poses ?? [], result.core, result.metrics)
        : { candidateDetected: false, reason: 'none' as const };
    multiPersonStateRef.current = stepTemporalSignal(
      multiPersonStateRef.current,
      multiPersonCandidate.candidateDetected,
      now,
      MULTI_PERSON_CONFIRM_MS,
      MULTI_PERSON_RELEASE_MS
    );
    const multiPersonConfirmed = multiPersonStateRef.current.confirmed;
    const multiPersonPending = isTemporalSignalPending(multiPersonStateRef.current);
    if (multiPersonConfirmed && !wasMultiPersonConfirmedRef.current) multiPersonEventCountRef.current += 1;
    wasMultiPersonConfirmedRef.current = multiPersonConfirmed;

    // Tracking loss: same hysteresis treatment for "no person detected" —
    // a single missed detection frame reads as "briefly lost," not "gone."
    personLostStateRef.current = stepTemporalSignal(
      personLostStateRef.current,
      result.status === 'no_person',
      now,
      PERSON_LOST_CONFIRM_MS,
      PERSON_LOST_RELEASE_MS
    );
    const personLostConfirmed = personLostStateRef.current.confirmed;
    const personLostElapsedMs = personLostStateRef.current.activeSince
      ? now - personLostStateRef.current.activeSince
      : 0;

    const tilt = evaluateCameraTilt(tiltGamma, tiltBeta);
    const locked = result.ok && tilt.ok && frameQuality.ok && !multiPersonConfirmed && !multiPersonPending;

    if (locked && !wasLockedRef.current) triggerHaptic(HAPTIC_PATTERNS.lockAcquired);
    wasLockedRef.current = locked;

    // Priority: a CONFIRMED second person overrides everything else — no
    // point discussing framing when the frame itself is invalid. Then the
    // subject's own pose result (with "no_person" reframed by how long the
    // gap has actually persisted — see personLostConfirmed/personLostElapsedMs),
    // then tilt, then frame quality.
    let effectiveKey: string | null = null;
    let effectiveMessage = '';
    let activeRule: string;
    if (multiPersonConfirmed) {
      effectiveKey = 'multiple_people';
      effectiveMessage = spokenMessageFor('multiple_people', 'Another person is visible in the frame.');
      activeRule = 'second_person_confirmed';
    } else if (!result.ok) {
      if (result.status === 'no_person') {
        if (personLostConfirmed && personLostElapsedMs >= PERSON_LOST_LONG_MS) {
          effectiveKey = 'tracking_lost_long';
          effectiveMessage = TRACKING_LOST_PROMPT;
          activeRule = 'tracking_lost';
        } else if (personLostConfirmed) {
          effectiveKey = 'tracking_lost_brief';
          effectiveMessage = TRACKING_BRIEFLY_LOST_PROMPT;
          activeRule = 'tracking_lost';
        } else {
          activeRule = 'uncertain'; // within the initial grace window — stay silent, not yet worth mentioning
        }
      } else {
        effectiveKey = result.status;
        effectiveMessage = result.message;
        activeRule = result.status === 'subject_changed' ? 'subject_changed' : 'low_confidence';
      }
    } else if (!tilt.ok) {
      effectiveKey = 'camera_tilted';
      effectiveMessage = tilt.message;
      activeRule = 'low_confidence';
    } else if (!frameQuality.ok) {
      effectiveKey = frameQuality.status;
      effectiveMessage = frameQuality.message;
      activeRule = 'low_confidence';
    } else {
      activeRule = multiPersonPending ? 'uncertain' : 'stable';
    }

    setContinuityOverride(
      multiPersonConfirmed || effectiveKey === 'tracking_lost_brief' || effectiveKey === 'tracking_lost_long'
        ? { key: effectiveKey!, message: effectiveMessage }
        : null
    );

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[posture-guidance] frame', {
        poseStatus: result.status,
        multiPerson: { ...multiPersonCandidate, confirmed: multiPersonConfirmed, pending: multiPersonPending },
        personLost: { confirmed: personLostConfirmed, elapsedMs: personLostElapsedMs },
        tiltOk: tilt.ok,
        frameQuality: { status: frameQuality.status, ok: frameQuality.ok },
        locked,
        effectiveKey,
        activeRule,
      });
    }

    if (locked) {
      lockLostAtRef.current = null;
      lastResolvedProblemKeyRef.current = null;
      if (readySinceRef.current === null) readySinceRef.current = now;
      const elapsed = now - readySinceRef.current;
      setStableForMs(Math.min(elapsed, REQUIRED_STABLE_MS));

      // Speak the one-time positive confirmation via the same guidance
      // machine (so it still respects "don't interrupt," "wait after
      // speaking") — key 'ready' naturally only fires once thanks to
      // repeat-suppression.
      const step1 = stepGuidance(guidanceMemoryRef.current, 'ready', now);
      guidanceMemoryRef.current = step1.memory;
      if (step1.decision === 'speak') {
        guidanceMemoryRef.current = markSpeechStarted(guidanceMemoryRef.current);
        guidedVoice.speak(READY_PROMPT, () => {
          guidanceMemoryRef.current = markSpeechEnded(guidanceMemoryRef.current, 'ready', Date.now());
        });
      }

      if (elapsed >= REQUIRED_STABLE_MS && !guidanceMemoryRef.current.isSpeaking) {
        if (countdownStartRef.current === null) countdownStartRef.current = now;
        const countdownElapsed = now - countdownStartRef.current;

        if (countdownElapsed >= COUNTDOWN_MS) {
          setAutoCaptureTriggered(true);
          setCountdownRemainingMs(null);
          triggerHaptic(HAPTIC_PATTERNS.captured);
          guidanceMemoryRef.current = markSpeechStarted(guidanceMemoryRef.current);
          guidedVoice.speak(TAKING_PHOTO_PROMPT, () => {
            guidanceMemoryRef.current = markSpeechEnded(guidanceMemoryRef.current, 'capturing', Date.now());
          });
          autoCaptureTimeoutRef.current = setTimeout(() => capturePhoto(result), 250);
        } else {
          const remaining = COUNTDOWN_MS - countdownElapsed;
          setCountdownRemainingMs(remaining);
          const wholeSecond = Math.ceil(remaining / 1000);
          if (lastCountdownTickRef.current !== wholeSecond) {
            lastCountdownTickRef.current = wholeSecond;
            triggerHaptic(HAPTIC_PATTERNS.lockAcquired);
          }
        }
      }
      return;
    }

    // Not locked this frame — but if we were already mid-hold, absorb a
    // brief blip before treating it as a real interruption (see
    // STABILITY_GRACE_MS's docblock).
    if (readySinceRef.current !== null) {
      if (lockLostAtRef.current === null) lockLostAtRef.current = now;
      if (now - lockLostAtRef.current < STABILITY_GRACE_MS) {
        return; // silently hold position — no reset, no correction spoken, countdown (if any) keeps running
      }
    }

    lockLostAtRef.current = null;
    readySinceRef.current = null;
    countdownStartRef.current = null;
    lastCountdownTickRef.current = null;
    setStableForMs(0);
    setCountdownRemainingMs(null);
    if (!effectiveKey) return;

    const decision = stepGuidance(guidanceMemoryRef.current, effectiveKey, now);
    guidanceMemoryRef.current = decision.memory;
    if (decision.decision === 'speak' && decision.keyToSpeak) {
      guidanceMemoryRef.current = markSpeechStarted(guidanceMemoryRef.current);
      let spoken = spokenMessageFor(decision.keyToSpeak, effectiveMessage);
      if (
        lastResolvedProblemKeyRef.current &&
        lastResolvedProblemKeyRef.current !== decision.keyToSpeak &&
        !SKIP_ACKNOWLEDGMENT_KEYS.has(decision.keyToSpeak)
      ) {
        spoken = `${pickAcknowledgment()} ${spoken}`;
      }
      lastResolvedProblemKeyRef.current = decision.keyToSpeak;
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[posture-guidance] speaking', { activeRule, activeFailure: effectiveKey, spokenPrompt: spoken });
      }
      guidedVoice.speak(spoken, () => {
        guidanceMemoryRef.current = markSpeechEnded(guidanceMemoryRef.current, decision.keyToSpeak!, Date.now());
      });
    }
  }, [poses, poseActive, poseLoading, poseLoadError, autoCaptureTriggered, tiltGamma, tiltBeta, frameQuality]);

  // Passive hip-line-angle sampling during a tracksPelvicDrop recording —
  // see pelvicDropScreening.ts's docblock for scope. Deliberately does not
  // gate or block recording; it only collects samples for analysis once
  // recording stops.
  useEffect(() => {
    if (phase !== 'recording' || !tracksPelvicDrop || !poses || poses.length === 0) return;
    const core = toCoreLandmarks(poses[0]!);
    if (!core) return;
    const metrics = computePoseMetrics(core);
    const confidence = Math.min(
      core.leftHip.visibility ?? 1,
      core.rightHip.visibility ?? 1
    );
    pelvicSamplesRef.current.push({
      hipLineAngle: metrics.hipLineAngle,
      confidence,
      timestampMs: Date.now(),
    });
  }, [poses, phase, tracksPelvicDrop]);

  useEffect(() => {
    return () => {
      if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
    };
  }, []);

  function switchCamera() {
    setFacingMode((m) => (m === 'user' ? 'environment' : 'user'));
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    pelvicSamplesRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const elapsed = step.durationSeconds ?? 0;
      const pelvicEstimate = tracksPelvicDrop
        ? computePelvicDropScreening(pelvicSamplesRef.current)
        : null;
      const postureEstimates: PostureEstimate[] | undefined = pelvicEstimate
        ? [
            {
              findingType: 'pelvic_drop_screening',
              side: 'not_applicable',
              value: pelvicEstimate.maxDeviationDegrees,
              unit: 'degrees',
              confidence: pelvicEstimate.confidence,
              severity: pelvicEstimate.maxDeviationDegrees > 4 ? 'mild' : 'none',
              narrative: pelvicEstimate.narrative,
              landmarksUsed: ['left_hip', 'right_hip'],
            },
          ]
        : undefined;
      setPendingMedia({
        blob,
        width: null,
        height: null,
        durationSeconds: elapsed,
        ...(postureEstimates ? { postureEstimates } : {}),
      });
      setPreviewUrl(URL.createObjectURL(blob));
      setPhase('preview');
    };

    recorderRef.current = recorder;
    recorder.start();
    setPhase('recording');
    setSecondsRemaining(step.durationSeconds ?? 15);
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  useEffect(() => {
    if (phase !== 'recording') return;
    if (secondsRemaining <= 0) {
      stopRecording();
      return;
    }
    const timer = setTimeout(() => setSecondsRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, secondsRemaining]);

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingMedia(null);
    setFrozenValidation(null);
    setPhase('ready');
  }

  function useThisMedia() {
    if (pendingMedia) onCaptured(pendingMedia);
  }

  if (phase === 'unsupported') {
    return (
      <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-sm text-[#1B3A2D]">
          Your browser doesn&apos;t support camera capture. Please try again on a phone or a browser
          with camera support.
        </p>
      </div>
    );
  }

  if (phase === 'denied') {
    return (
      <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-sm text-[#1B3A2D]">
          We need camera access to guide you through this assessment. Please allow camera access in
          your browser settings and try again.
        </p>
        <button
          type="button"
          onClick={() => setFacingMode((m) => m)}
          className="mt-4 rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          Try again
        </button>
      </div>
    );
  }

  const tilt = evaluateCameraTilt(tiltGamma, tiltBeta);
  const overallOk = validation.ok && tilt.ok && frameQuality.ok && !continuityOverride;
  const notReady =
    NOT_READY_STATUSES.has(validation.status) || (continuityOverride !== null && NOT_READY_STATUSES.has(continuityOverride.key));
  const statusChip = !requiresStanding
    ? null
    : poseLoadError
      ? { label: CAPTURE_STATUS_LABEL.manual, tone: 'neutral' as const }
      : poseLoading
        ? { label: CAPTURE_STATUS_LABEL.loading, tone: 'neutral' as const }
        : autoCaptureTriggered
          ? { label: CAPTURE_STATUS_LABEL.capturing, tone: 'success' as const }
          : !overallOk
            ? { label: notReady ? CAPTURE_STATUS_LABEL.not_ready : CAPTURE_STATUS_LABEL.adjust, tone: 'warning' as const }
            : countdownRemainingMs !== null
              ? { label: CAPTURE_STATUS_LABEL.hold_still, tone: 'success' as const }
              : stableForMs >= REQUIRED_STABLE_MS
                ? { label: CAPTURE_STATUS_LABEL.ready, tone: 'success' as const }
                : { label: CAPTURE_STATUS_LABEL.hold_still, tone: 'success' as const };

  const currentScreenLine = requiresStanding
    ? poseLoadError
      ? step.instructions[0]
      : continuityOverride
        ? continuityOverride.message
        : !validation.ok && validation.message
          ? validation.message
          : !tilt.ok
            ? tilt.message
            : !frameQuality.ok
              ? frameQuality.message
              : screenLine
    : step.instructions[instructionIndex];

  const captureGateOk = !requiresStanding || poseLoadError || (!poseLoading && overallOk);
  const silhouetteTone: OverlayTone = !requiresStanding
    ? 'neutral'
    : poseLoading || poseLoadError
      ? 'neutral'
      : overallOk
        ? 'success'
        : notReady
          ? 'neutral'
          : 'warning';

  // At most two angle labels during positioning — the two most relevant
  // to whichever view is being captured, never a wall of numbers.
  const angleLabels: AngleLabel[] = [];
  if (validation.metrics) {
    const m = validation.metrics;
    if (step.captureType === 'front' || step.captureType === 'back') {
      angleLabels.push({ at: m.shoulderMid, degrees: Math.abs(m.shoulderLineAngle) });
      angleLabels.push({ at: m.hipMid, degrees: Math.abs(m.hipLineAngle) });
    } else if (step.captureType === 'left_side' || step.captureType === 'right_side') {
      angleLabels.push({ at: m.kneeMid, degrees: (m.leftKneeAngle + m.rightKneeAngle) / 2 });
    }
  }

  const previewOverlaySource = phase === 'preview' ? frozenValidation : validation;

  // Movement steps get no pose-validation gating, but a tracksPelvicDrop
  // recording (the guided single-leg stance) still runs pose detection —
  // this gives that step the same live "the system is measuring you"
  // overlay standing photos get, instead of a static silhouette during
  // the one movement step where measurement is actually happening.
  const movementCore =
    tracksPelvicDrop && phase === 'recording' && poses && poses.length > 0 ? toCoreLandmarks(poses[0]!) : null;
  const movementMetrics = movementCore ? computePoseMetrics(movementCore) : null;
  const movementAngleLabels: AngleLabel[] = movementMetrics
    ? [{ at: movementMetrics.hipMid, degrees: Math.abs(movementMetrics.hipLineAngle) }]
    : [];

  // "Actively scanning" reinforcement: shown only while a standing-photo
  // step has no confident subject locked on yet — the moment the member
  // needs the most reassurance that something intelligent is happening.
  const showScanSweep =
    requiresStanding && phase === 'ready' && !poseLoading && !poseLoadError && !validation.core;

  // Camera opening sequence — every stage below is a real, already-tracked
  // readiness signal (never a fixed fake delay): permission/stream still
  // being acquired, the MediaPipe WASM model still downloading, or the
  // brief window after the model is ready but before any confident pose
  // has resolved yet. Unmounts itself the instant validation.core exists.
  const initializationStage: InitializationStage | null =
    phase === 'requesting'
      ? 'preparing'
      : requiresStanding && phase === 'ready' && poseActive && poseLoading
        ? 'calibrating'
        : requiresStanding && phase === 'ready' && poseActive && !poseLoading && !poseLoadError && !validation.core
          ? 'locating'
          : null;

  return (
    <div className="overflow-hidden rounded-[28px] bg-black shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <div className="relative aspect-[3/4] w-full">
        {phase === 'preview' && previewUrl ? (
          isVideo ? (
            <video src={previewUrl} controls playsInline className="h-full w-full object-cover" />
          ) : (
            <>
              <img src={previewUrl} alt="Captured preview" className="h-full w-full object-cover" />
              {requiresStanding && previewOverlaySource?.core && (
                <PoseOverlay
                  landmarks={previewOverlaySource.core}
                  metrics={previewOverlaySource.metrics}
                  tone="success"
                  angleLabels={angleLabels}
                  mirrored={false}
                />
              )}
            </>
          )
        ) : phase === 'analyzing' && previewUrl ? (
          <>
            <img src={previewUrl} alt="Captured preview" className="h-full w-full object-cover" />
            {requiresStanding && frozenValidation?.core && (
              <PoseOverlay
                landmarks={frozenValidation.core}
                metrics={frozenValidation.metrics}
                tone="success"
                angleLabels={angleLabels}
                mirrored={false}
              />
            )}
            <CaptureFlash />
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white">
                {analyzingSubphase === 'captured' ? 'Alignment captured' : 'Analyzing alignment…'}
              </span>
            </div>
          </>
        ) : (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              className={`h-full w-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
            />
            {requiresStanding && validation.core ? (
              <PoseOverlay
                landmarks={validation.core}
                metrics={validation.metrics}
                tone={silhouetteTone}
                angleLabels={angleLabels}
                mirrored={facingMode === 'user'}
                confidence={validation.confidence}
                correctionTarget={overallOk ? null : validation.correctionTarget}
                showBoundingZone={silhouetteTone !== 'success'}
              />
            ) : movementCore ? (
              <PoseOverlay
                landmarks={movementCore}
                metrics={movementMetrics}
                tone="neutral"
                angleLabels={movementAngleLabels}
                mirrored={facingMode === 'user'}
              />
            ) : (
              <SilhouetteGuide
                wide={step.captureType === 'walking' || step.captureType === 'movement'}
                tone={silhouetteTone}
              />
            )}
            {showScanSweep && <ScanSweep />}
            {requiresStanding && phase === 'ready' && overallOk && !autoCaptureTriggered && (
              countdownRemainingMs !== null ? (
                <CaptureCountdownNumeral remainingMs={countdownRemainingMs} />
              ) : (
                <CaptureCountdown
                  progress={stableForMs / REQUIRED_STABLE_MS}
                  tone={stableForMs >= REQUIRED_STABLE_MS ? 'success' : 'neutral'}
                />
              )
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={qualityCanvasRef} className="hidden" />

        {initializationStage && <InitializationOverlay stage={initializationStage} />}

        {statusChip && (phase === 'ready' || phase === 'recording') && (
          <div className="absolute left-4 top-4 z-10">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                statusChip.tone === 'success'
                  ? 'bg-emerald-500/90 text-white'
                  : statusChip.tone === 'warning'
                    ? 'bg-amber-500/90 text-white'
                    : 'bg-black/60 text-white'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  statusChip.tone === 'success' ? 'animate-pulse bg-white' : 'bg-white/80'
                }`}
              />
              {statusChip.label}
            </span>
          </div>
        )}

        {(phase === 'ready' || phase === 'recording') && currentScreenLine && (
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4 pt-12">
            <p className="text-center text-sm font-medium text-white">{currentScreenLine}</p>
          </div>
        )}

        {requiresStanding && phase === 'ready' && guidedVoice.status === 'blocked' && (
          <button
            type="button"
            onClick={handleEnableVoiceTap}
            className="absolute inset-x-4 top-24 z-20 flex items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-4 py-3 text-sm font-semibold text-white shadow-lg"
          >
            <Ear className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Tap once to enable voice guidance
          </button>
        )}

        {requiresStanding && phase === 'ready' && guidedVoice.status === 'unavailable' && (
          <div className="absolute inset-x-4 top-24 z-20 rounded-2xl bg-black/60 px-4 py-2.5 text-center text-xs font-medium text-white">
            Voice guidance isn&apos;t available on this browser — follow the on-screen instructions.
          </div>
        )}

        {phase === 'recording' && (
          <div className="absolute inset-x-0 top-16 flex justify-center">
            <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              Recording — {secondsRemaining}s
            </span>
          </div>
        )}

        {phase === 'ready' && (
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            {requiresStanding && guidedVoice.isSupported && guidedVoice.status === 'idle' && (
              <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white">
                Voice loading…
              </span>
            )}
            {requiresStanding && guidedVoice.isSupported && (
              <button
                type="button"
                onClick={() => guidedVoice.toggleMute()}
                title={guidedVoice.status === 'muted' ? 'Unmute voice guidance' : 'Mute voice guidance'}
                aria-label={guidedVoice.status === 'muted' ? 'Unmute voice guidance' : 'Mute voice guidance'}
                aria-pressed={guidedVoice.status === 'muted'}
                className="rounded-full bg-black/50 p-2 text-white"
              >
                {guidedVoice.status === 'muted' ? (
                  <VolumeX className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={switchCamera}
              title="Switch camera"
              className="rounded-full bg-black/50 p-2 text-white"
            >
              <SwitchCamera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}

        {poseLoadError && phase === 'ready' && (
          <div className="absolute inset-x-0 bottom-0 bg-amber-500/90 p-2">
            <p className="text-center text-xs font-medium text-white">{poseLoadError}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 bg-white p-5">
        {phase === 'preview' ? (
          <>
            <button
              type="button"
              onClick={retake}
              className="flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/15 px-5 py-2.5 text-sm font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.04]"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Retake
            </button>
            <button
              type="button"
              onClick={useThisMedia}
              className="rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-medium text-white hover:brightness-110"
            >
              {isVideo ? 'Use this video' : 'Use this photo'}
            </button>
          </>
        ) : isVideo ? (
          phase === 'recording' ? (
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-sm font-medium text-white hover:brightness-110"
            >
              <CircleStop className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Stop recording
            </button>
          ) : (
            <button
              type="button"
              disabled={phase !== 'ready'}
              onClick={startRecording}
              className="flex items-center gap-2 rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              <Video className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Start recording
            </button>
          )
        ) : phase === 'analyzing' ? (
          <span className="text-sm font-medium text-[#6B7A72]">Analyzing alignment…</span>
        ) : (
          <button
            type="button"
            disabled={phase !== 'ready' || !captureGateOk || autoCaptureTriggered}
            onClick={() => {
              triggerHaptic(HAPTIC_PATTERNS.captured);
              capturePhoto(validation);
            }}
            className="flex items-center gap-2 rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Capture
          </button>
        )}
      </div>
    </div>
  );
}
