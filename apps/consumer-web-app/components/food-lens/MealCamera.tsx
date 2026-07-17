'use client';

/**
 * The meal-photo capture UX — deliberately much simpler than
 * components/body-assessment/CameraCapture.tsx. Per docs/food-lens/
 * 01-architecture.md §1.2: Food Lens's on-device job is only cheap
 * framing/quality guidance (brightness via canvas pixel sampling), never
 * food identification — that's a backend vision-model call
 * (analyzeFoodLensScanAction). No pose landmarker, no ML model on-device
 * for MVP.
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, SwitchCamera } from 'lucide-react';

type Props = {
  onCapture: (blob: Blob) => void;
  busy?: boolean;
};

const DARK_THRESHOLD = 35; // 0-255 average luminance below this reads as "too dark to be useful"
const DIM_THRESHOLD = 70; // below this, warn but still allow

function averageLuminance(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const { data } = ctx.getImageData(0, 0, width, height);
  let sum = 0;
  const sampleStep = 4 * 8; // sample every 8th pixel — plenty for a coarse brightness read, far cheaper than every pixel
  let count = 0;
  for (let i = 0; i < data.length; i += sampleStep) {
    sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    count++;
  }
  return count === 0 ? 128 : sum / count;
}

export function MealCamera({ onCapture, busy = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setError(null);
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? `Couldn't access your camera: ${err.message}`
            : "Couldn't access your camera."
        );
      }
    }

    if (!previewUrl) start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode, previewUrl]);

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const luminance = averageLuminance(ctx, canvas.width, canvas.height);
    if (luminance < DARK_THRESHOLD) {
      setQualityWarning('This photo looks too dark to identify food reliably. Try more light, then retake.');
      setBlocked(true);
    } else if (luminance < DIM_THRESHOLD) {
      setQualityWarning('This looks a little dim — you can use it, or retake with more light.');
      setBlocked(false);
    } else {
      setQualityWarning(null);
      setBlocked(false);
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPreviewBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());
      },
      'image/jpeg',
      0.85
    );
  }

  function handleRetake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setQualityWarning(null);
    setBlocked(false);
  }

  function handleUse() {
    if (previewBlob && !blocked) onCapture(previewBlob);
  }

  if (error) {
    return (
      <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-sm text-[#6B7A72]">{error}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] bg-black shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <div className="relative aspect-square w-full bg-black">
        {previewUrl ? (
          <img src={previewUrl} alt="Captured meal" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        )}
        <canvas ref={canvasRef} className="hidden" />

        {!previewUrl && (
          <button
            type="button"
            onClick={() => setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))}
            aria-label="Switch camera"
            className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white backdrop-blur"
          >
            <SwitchCamera className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>

      {qualityWarning && (
        <p
          className={`px-4 py-2 text-center text-xs ${blocked ? 'bg-[#B45309]/15 text-[#B45309]' : 'bg-[#F5B700]/15 text-[#854D0E]'}`}
        >
          {qualityWarning}
        </p>
      )}

      <div className="flex items-center justify-center gap-4 bg-white p-4">
        {previewUrl ? (
          <>
            <button
              type="button"
              onClick={handleRetake}
              disabled={busy}
              className="flex items-center gap-2 rounded-full border border-[#1B3A2D]/15 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Retake
            </button>
            <button
              type="button"
              onClick={handleUse}
              disabled={busy || blocked}
              className="rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Uploading…' : 'Use this photo'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleCapture}
            aria-label="Capture photo"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F5B700] text-[#1B3A2D] shadow-[0_10px_24px_-6px_rgba(245,183,0,0.55)]"
          >
            <Camera className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
