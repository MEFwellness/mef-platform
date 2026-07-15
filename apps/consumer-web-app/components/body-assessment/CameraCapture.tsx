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
import { Camera, RotateCcw, SwitchCamera, Video, CircleStop, Volume2 } from 'lucide-react';
import type { CaptureStepConfig } from '@/lib/body-assessment/assessmentTypes';
import type { BodyLandmarkPoint } from '@mef/shared-types-contracts';
import { usePoseLandmarker } from '@/hooks/usePoseLandmarker';
import { useGuidedVoice } from '@/hooks/useGuidedVoice';
import { useDeviceTilt } from '@/hooks/useDeviceTilt';
import { validatePoseFrame, type PoseValidationResult } from '@/lib/body-assessment/poseValidation';
import { evaluateCameraTilt } from '@/lib/body-assessment/cameraTilt';
import { computeFrameQualityStats, evaluateFrameQuality, type FrameQualityResult } from '@/lib/body-assessment/frameQuality';
import { triggerHaptic, HAPTIC_PATTERNS } from '@/lib/body-assessment/haptics';
import {
  CAMERA_SETUP_INTRO,
  CAPTURE_STATUS_LABEL,
  READY_PROMPT,
  TAKING_PHOTO_PROMPT,
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
import { CaptureFlash } from './CaptureFlash';
import { ScanSweep } from './ScanSweep';

export type CapturedMedia = {
  blob: Blob;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Present only for a validated standing-photo capture — the exact frame's landmarks, mapped for storage. */
  landmarks?: BodyLandmarkPoint[];
  /** Present only for a validated standing-photo capture — screening estimates computed from the same frame. */
  postureEstimates?: PostureEstimate[];
};

type Props = {
  step: CaptureStepConfig;
  onCaptured: (media: CapturedMedia) => void;
};

type CameraPhase = 'requesting' | 'ready' | 'recording' | 'analyzing' | 'preview' | 'denied' | 'unsupported';

/** How long a valid, stable pose must hold before we auto-capture — separate from voice-guidance timing (which governs how often we SPEAK, not when we capture). */
const REQUIRED_STABLE_MS = 1750;
/** A brief, deliberate pause so "Analyzing alignment…" reads as a real step rather than a flash — the computation itself is near-instant (pure arithmetic on landmarks already in memory), so this is a UX pacing choice, not processing time. */
const ANALYZING_DISPLAY_MS = 700;

const NOT_READY_STATUSES = new Set(['no_person', 'multiple_people', 'low_confidence']);

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

  const [validation, setValidation] = useState<PoseValidationResult>({
    status: 'no_person',
    ok: false,
    message: '',
    metrics: null,
    core: null,
    rawPoints: null,
  });
  const [stableForMs, setStableForMs] = useState(0);
  const [autoCaptureTriggered, setAutoCaptureTriggered] = useState(false);
  const [screenLine, setScreenLine] = useState('');
  /** The frozen frame (landmarks + metrics) the capture actually fired on — what the preview overlay and the persisted measurements are both built from. */
  const [frozenValidation, setFrozenValidation] = useState<PoseValidationResult | null>(null);

  const readySinceRef = useRef<number | null>(null);
  const introQueueStartedRef = useRef(false);
  const autoCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guidanceMemoryRef = useRef<GuidanceMemory>(resetGuidanceMemory());
  /** Hip-line-angle samples collected during a tracksPelvicDrop recording — see pelvicDropScreening.ts's docblock for exactly what this passive analysis does and doesn't cover. */
  const pelvicSamplesRef = useRef<PelvicDropSample[]>([]);
  /** The confident subject's hip midpoint from the last mid-hold frame — see poseValidation.ts's previousSubjectCenter docblock. Only populated/consulted while readySinceRef is active. */
  const subjectCenterRef = useRef<Point | null>(null);
  /** Tracks whether the previous frame was locked (result.ok && tilt.ok && frameQuality.ok) so the lock-acquired haptic fires once on the rising edge, not every frame while held. */
  const wasLockedRef = useRef(false);
  const qualityCanvasRef = useRef<HTMLCanvasElement>(null);

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
    readySinceRef.current = null;
    subjectCenterRef.current = null;
    wasLockedRef.current = false;
    guidanceMemoryRef.current = resetGuidanceMemory();
    setAutoCaptureTriggered(false);
    setStableForMs(0);
    setValidation({ status: 'no_person', ok: false, message: '', metrics: null, core: null, rawPoints: null });
    setFrameQuality({ status: 'ready', ok: true, message: '' });
    if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
  }, [step]);

  // Speak the fixed setup script once per step, one line at a time,
  // cancelling before each new line (useGuidedVoice's speak() always does
  // this) so instructions never stack on top of each other.
  useEffect(() => {
    if (phase !== 'ready' || !requiresStanding || introQueueStartedRef.current) return;
    introQueueStartedRef.current = true;
    const lines = [...CAMERA_SETUP_INTRO, ...step.instructions];
    let index = 0;
    let cancelled = false;

    function playNext() {
      if (cancelled || index >= lines.length) return;
      const line = lines[index]!;
      index += 1;
      setScreenLine(line);
      guidedVoice.speak(line, playNext);
    }
    playNext();

    return () => {
      cancelled = true;
    };
  }, [phase, requiresStanding, step]);

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
        setFrameQuality(evaluateFrameQuality(stats));
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

        setFrozenValidation(finalValidation);
        setPendingMedia({
          blob,
          width: canvas.width,
          height: canvas.height,
          durationSeconds: null,
          ...(landmarks ? { landmarks } : {}),
          ...(postureEstimates ? { postureEstimates } : {}),
        });
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase('analyzing');
        setTimeout(() => setPhase('preview'), ANALYZING_DISPLAY_MS);
      },
      'image/jpeg',
      0.9
    );
  }

  // Live pose validation loop for standing photo steps: interpret the
  // latest frame, decide whether it counts toward the stability window,
  // and drive the voice-guidance state machine.
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

    const tilt = evaluateCameraTilt(tiltGamma, tiltBeta);
    const now = Date.now();
    const locked = result.ok && tilt.ok && frameQuality.ok;

    if (locked && !wasLockedRef.current) triggerHaptic(HAPTIC_PATTERNS.lockAcquired);
    wasLockedRef.current = locked;

    // Pose problems take priority over tilt, and tilt over frame quality —
    // no point telling someone to level the phone when we can't see them
    // at all yet, or to hold steadier when the phone itself is crooked.
    const effectiveKey: string | null = !result.ok
      ? result.status
      : !tilt.ok
        ? 'camera_tilted'
        : !frameQuality.ok
          ? frameQuality.status
          : null;
    const effectiveMessage = !result.ok ? result.message : !tilt.ok ? tilt.message : frameQuality.message;

    if (locked) {
      if (readySinceRef.current === null) readySinceRef.current = now;
      const elapsed = now - readySinceRef.current;
      setStableForMs(elapsed);

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
        setAutoCaptureTriggered(true);
        triggerHaptic(HAPTIC_PATTERNS.captured);
        guidanceMemoryRef.current = markSpeechStarted(guidanceMemoryRef.current);
        guidedVoice.speak(TAKING_PHOTO_PROMPT, () => {
          guidanceMemoryRef.current = markSpeechEnded(guidanceMemoryRef.current, 'capturing', Date.now());
        });
        autoCaptureTimeoutRef.current = setTimeout(() => capturePhoto(result), 550);
      }
      return;
    }

    readySinceRef.current = null;
    setStableForMs(0);
    if (!effectiveKey) return;

    const decision = stepGuidance(guidanceMemoryRef.current, effectiveKey, now);
    guidanceMemoryRef.current = decision.memory;
    if (decision.decision === 'speak' && decision.keyToSpeak) {
      guidanceMemoryRef.current = markSpeechStarted(guidanceMemoryRef.current);
      const spoken = spokenMessageFor(decision.keyToSpeak, effectiveMessage);
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
  const overallOk = validation.ok && tilt.ok && frameQuality.ok;
  const notReady = NOT_READY_STATUSES.has(validation.status);
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
            : stableForMs >= REQUIRED_STABLE_MS
              ? { label: CAPTURE_STATUS_LABEL.ready, tone: 'success' as const }
              : { label: CAPTURE_STATUS_LABEL.hold_still, tone: 'success' as const };

  const currentScreenLine = requiresStanding
    ? poseLoadError
      ? step.instructions[0]
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
            <CaptureFlash />
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white">
                Analyzing alignment…
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
              <CaptureCountdown
                progress={stableForMs / REQUIRED_STABLE_MS}
                tone={stableForMs >= REQUIRED_STABLE_MS ? 'success' : 'neutral'}
              />
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={qualityCanvasRef} className="hidden" />

        {phase === 'requesting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-sm text-white">Starting camera…</p>
          </div>
        )}

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

        {phase === 'recording' && (
          <div className="absolute inset-x-0 top-16 flex justify-center">
            <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              Recording — {secondsRemaining}s
            </span>
          </div>
        )}

        {phase === 'ready' && (
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            {requiresStanding && (
              <button
                type="button"
                onClick={() => guidedVoice.replay()}
                title="Replay instruction"
                aria-label="Replay current instruction"
                className="rounded-full bg-black/50 p-2 text-white"
              >
                <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
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
