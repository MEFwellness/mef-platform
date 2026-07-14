'use client';

/**
 * The complete camera capture workflow for one guided-assessment step —
 * genuinely new ground in this codebase (no getUserMedia/MediaRecorder use
 * existed anywhere before this milestone; see the architecture survey in
 * lib/body-assessment/README notes). Pure browser APIs, no camera library
 * dependency.
 *
 * The silhouette overlay is a placeholder guide only — it does not detect
 * or align to the member's actual body. It exists so a future posture/
 * movement analysis provider has a consistent framing convention to rely
 * on (member roughly centered, roughly filling the guide), and so the
 * member gets visual confirmation of "stand about here" today.
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, SwitchCamera, Video, CircleStop } from 'lucide-react';
import type { CaptureStepConfig } from '@/lib/body-assessment/assessmentTypes';

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

function SilhouetteGuide({ wide }: { wide: boolean }) {
  return (
    <svg
      viewBox="0 0 200 320"
      className={`pointer-events-none absolute inset-0 mx-auto h-full ${wide ? 'w-full' : 'w-2/3'} opacity-40`}
      aria-hidden="true"
    >
      {wide ? (
        <rect
          x="10"
          y="40"
          width="180"
          height="240"
          rx="16"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeDasharray="10 8"
        />
      ) : (
        <g fill="none" stroke="white" strokeWidth="3" strokeDasharray="8 6">
          <circle cx="100" cy="45" r="30" />
          <path d="M55 300 L60 130 Q100 105 140 130 L145 300" />
          <path d="M60 140 L20 210" />
          <path d="M140 140 L180 210" />
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

  const isVideo = step.mediaType === 'video';

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

  // Cycle through guidance lines every few seconds while waiting to capture.
  useEffect(() => {
    if (phase !== 'ready' || step.instructions.length <= 1) return;
    const timer = setInterval(() => {
      setInstructionIndex((i) => (i + 1) % step.instructions.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [phase, step.instructions.length]);

  function switchCamera() {
    setFacingMode((m) => (m === 'user' ? 'environment' : 'user'));
  }

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
            />
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />

        {phase === 'requesting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-sm text-white">Starting camera…</p>
          </div>
        )}

        {(phase === 'ready' || phase === 'recording') && (
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4">
            <p className="text-center text-sm font-medium text-white">
              {step.instructions[instructionIndex]}
            </p>
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
          <button
            type="button"
            onClick={switchCamera}
            title="Switch camera"
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white"
          >
            <SwitchCamera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
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
            disabled={phase !== 'ready'}
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
