'use client';

/**
 * The complete camera capture workflow for one guided-assessment step.
 * Pure browser APIs, no camera library dependency, plus (for image/photo
 * steps only) on-device pose validation via hooks/usePoseLandmarker.ts —
 * MediaPipe Pose Landmarker running fully client-side, no server round
 * trip. lib/body-assessment/poseValidation.ts decides, frame by frame,
 * whether the member is a single, clearly-visible, correctly-framed,
 * correctly-oriented, standing person; this component's job is turning
 * that per-frame verdict into voice guidance, a status indicator, and a
 * stability timer that gates when a photo may actually be taken.
 *
 * Movement/video steps (walking, squat, shoulder mobility, etc.) are
 * unchanged from before — this validator only applies to static standing
 * photo steps, which is the one the platform got wrong (capturing a
 * seated member for an assessment that required standing).
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, SwitchCamera, Video, CircleStop, Volume2 } from 'lucide-react';
import type { CaptureStepConfig } from '@/lib/body-assessment/assessmentTypes';
import { usePoseLandmarker } from '@/hooks/usePoseLandmarker';
import { useGuidedVoice } from '@/hooks/useGuidedVoice';
import { validatePoseFrame, type PoseValidationResult } from '@/lib/body-assessment/poseValidation';
import { CAMERA_SETUP_INTRO, CAPTURE_STATUS_LABEL, TAKING_PHOTO_PROMPT } from '@/lib/body-assessment/voiceGuidance';

export type CapturedMedia = {
  blob: Blob;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

type Props = {
  step: CaptureStepConfig;
  onCaptured: (media: CapturedMedia) => void;
};

type CameraPhase = 'requesting' | 'ready' | 'recording' | 'preview' | 'denied' | 'unsupported';

/** How long a valid, stable pose must hold before we auto-capture. */
const REQUIRED_STABLE_MS = 1750;
/** Floor between two spoken corrections when the correction itself changed. */
const MIN_SPEAK_GAP_MS = 1200;
/** How often to repeat the same still-uncorrected instruction as a reminder. */
const REMINDER_GAP_MS = 4500;

const NOT_READY_STATUSES = new Set(['no_person', 'multiple_people', 'low_confidence']);

function SilhouetteGuide({ wide, tone }: { wide: boolean; tone: 'neutral' | 'warning' | 'success' }) {
  const stroke = tone === 'success' ? '#34D399' : tone === 'warning' ? '#FBBF24' : 'white';
  return (
    <svg
      viewBox="0 0 200 400"
      className={`pointer-events-none absolute inset-0 mx-auto h-full ${wide ? 'w-full' : 'w-2/3'} opacity-50 transition-colors`}
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
  });
  const [stableForMs, setStableForMs] = useState(0);
  const [autoCaptureTriggered, setAutoCaptureTriggered] = useState(false);
  const [screenLine, setScreenLine] = useState('');

  const readySinceRef = useRef<number | null>(null);
  const lastSpokenMessageRef = useRef('');
  const lastSpokenAtRef = useRef(0);
  const introQueueStartedRef = useRef(false);
  const autoCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVideo = step.mediaType === 'video';
  const requiresStanding = !isVideo;
  const poseActive = phase === 'ready' && requiresStanding;

  const { poses, isLoading: poseLoading, loadError: poseLoadError } = usePoseLandmarker(videoRef, poseActive);
  const guidedVoice = useGuidedVoice('assessment-guidance');

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
    lastSpokenMessageRef.current = '';
    lastSpokenAtRef.current = 0;
    setAutoCaptureTriggered(false);
    setStableForMs(0);
    setValidation({ status: 'no_person', ok: false, message: '' });
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

  function capturePhoto() {
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
        setPendingMedia({
          blob,
          width: canvas.width,
          height: canvas.height,
          durationSeconds: null,
        });
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase('preview');
      },
      'image/jpeg',
      0.9
    );
  }

  // Live pose validation loop for standing photo steps: interpret the
  // latest frame, decide whether it counts toward the stability window,
  // and speak a correction when something's wrong.
  useEffect(() => {
    if (!poseActive || poseLoading || poseLoadError || autoCaptureTriggered) return;

    const result = validatePoseFrame(poses ?? [], { requiresStanding, captureType: step.captureType });
    setValidation(result);
    const now = Date.now();

    if (result.ok) {
      lastSpokenMessageRef.current = '';
      if (readySinceRef.current === null) readySinceRef.current = now;
      const elapsed = now - readySinceRef.current;
      setStableForMs(elapsed);

      if (elapsed >= REQUIRED_STABLE_MS) {
        setAutoCaptureTriggered(true);
        guidedVoice.speak(TAKING_PHOTO_PROMPT);
        autoCaptureTimeoutRef.current = setTimeout(() => capturePhoto(), 550);
      }
      return;
    }

    readySinceRef.current = null;
    setStableForMs(0);
    if (!result.message) return;
    const changed = result.message !== lastSpokenMessageRef.current;
    const gap = now - lastSpokenAtRef.current;
    if ((changed && gap > MIN_SPEAK_GAP_MS) || (!changed && gap > REMINDER_GAP_MS)) {
      lastSpokenMessageRef.current = result.message;
      lastSpokenAtRef.current = now;
      guidedVoice.speak(result.message);
    }
  }, [poses, poseActive, poseLoading, poseLoadError, autoCaptureTriggered]);

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
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const elapsed = step.durationSeconds ?? 0;
      setPendingMedia({ blob, width: null, height: null, durationSeconds: elapsed });
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

  const notReady = NOT_READY_STATUSES.has(validation.status);
  const statusChip = !requiresStanding
    ? null
    : poseLoadError
      ? { label: CAPTURE_STATUS_LABEL.manual, tone: 'neutral' as const }
      : poseLoading
        ? { label: CAPTURE_STATUS_LABEL.loading, tone: 'neutral' as const }
        : autoCaptureTriggered
          ? { label: CAPTURE_STATUS_LABEL.capturing, tone: 'success' as const }
          : !validation.ok
            ? { label: notReady ? CAPTURE_STATUS_LABEL.not_ready : CAPTURE_STATUS_LABEL.adjust, tone: 'warning' as const }
            : stableForMs >= REQUIRED_STABLE_MS
              ? { label: CAPTURE_STATUS_LABEL.ready, tone: 'success' as const }
              : { label: CAPTURE_STATUS_LABEL.hold_still, tone: 'success' as const };

  const currentScreenLine = requiresStanding
    ? poseLoadError
      ? step.instructions[0]
      : !validation.ok && validation.message
        ? validation.message
        : screenLine
    : step.instructions[instructionIndex];

  const captureGateOk = !requiresStanding || poseLoadError || (!poseLoading && validation.ok);
  const silhouetteTone: 'neutral' | 'warning' | 'success' = !requiresStanding
    ? 'neutral'
    : poseLoading || poseLoadError
      ? 'neutral'
      : validation.ok
        ? 'success'
        : notReady
          ? 'neutral'
          : 'warning';

  return (
    <div className="overflow-hidden rounded-[28px] bg-black shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <div className="relative aspect-[3/4] w-full">
        {phase === 'preview' && previewUrl ? (
          isVideo ? (
            <video src={previewUrl} controls playsInline className="h-full w-full object-cover" />
          ) : (
            <img src={previewUrl} alt="Captured preview" className="h-full w-full object-cover" />
          )
        ) : (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              className={`h-full w-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
            />
            <SilhouetteGuide
              wide={step.captureType === 'walking' || step.captureType === 'movement'}
              tone={silhouetteTone}
            />
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />

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
        ) : (
          <button
            type="button"
            disabled={phase !== 'ready' || !captureGateOk || autoCaptureTriggered}
            onClick={capturePhoto}
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
