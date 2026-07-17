'use client';

/**
 * Barcode capture UX — on-device decode only, per docs/food-lens/01-
 * architecture.md §1.2's precedent for the meal-photo capture flow ("only
 * the genuinely real-time part runs on-device"). Uses the native
 * BarcodeDetector Web API where available (Chrome/Edge/Android — real-time,
 * no network round trip, no AI cost), falling back to @zxing/browser
 * everywhere else. Only the decoded barcode string ever reaches the
 * backend (via onDecode) — raw camera frames never leave the device.
 */

import { useEffect, useRef, useState } from 'react';
import { Flashlight, FlashlightOff, Keyboard, SwitchCamera, X } from 'lucide-react';
import { validateBarcode } from '@/lib/food-products/barcode';

type Phase = 'starting' | 'scanning' | 'denied' | 'manual';

type Props = {
  onDecode: (barcode: string) => void;
  onCancel: () => void;
  busy?: boolean;
};

type DetectorLike = {
  stop: () => void;
};

const SUPPORTED_FORMATS = ['upc_a', 'upc_e', 'ean_8', 'ean_13'];

function hasNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

export function BarcodeScanner({ onDecode, onCancel, busy = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorControlRef = useRef<DetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const decodedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('starting');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  function stopDetection() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    detectorControlRef.current?.stop();
    detectorControlRef.current = null;
  }

  function stopCamera() {
    stopDetection();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function handleDecoded(rawValue: string) {
    if (decodedRef.current) return;
    const validation = validateBarcode(rawValue);
    if (!validation.valid) return; // keep scanning — not one of our supported formats/checksums
    decodedRef.current = true;
    stopCamera();
    onDecode(validation.normalized);
  }

  useEffect(() => {
    let cancelled = false;
    decodedRef.current = false;

    async function start() {
      setPhase('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
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

        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as
          (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchSupported(Boolean(capabilities?.torch));

        setPhase('scanning');
        await startDetection();
      } catch {
        if (!cancelled) setPhase('denied');
      }
    }

    async function startDetection() {
      const video = videoRef.current;
      if (!video) return;

      if (hasNativeBarcodeDetector()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const DetectorCtor = (window as any).BarcodeDetector;
        const detector = new DetectorCtor({ formats: SUPPORTED_FORMATS });

        const tick = async () => {
          if (decodedRef.current || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length > 0 && results[0].rawValue) {
              handleDecoded(results[0].rawValue);
              return;
            }
          } catch {
            // A transient detect() failure (e.g. frame not ready yet) — keep scanning.
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Fallback: @zxing/browser, restricted to the same four formats.
      const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.EAN_8,
        BarcodeFormat.EAN_13,
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (result) handleDecoded(result.getText());
      });
      detectorControlRef.current = controls;
    }

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [facingMode]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      // Some browsers report torch capability but reject the constraint —
      // fail silently rather than blocking the scan flow over a flashlight.
    }
  }

  function handleManualSubmit() {
    const validation = validateBarcode(manualValue);
    if (!validation.valid) {
      setManualError("That doesn't look like a valid UPC-A, UPC-E, EAN-8, or EAN-13 barcode.");
      return;
    }
    setManualError(null);
    onDecode(validation.normalized);
  }

  if (phase === 'manual') {
    return (
      <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Enter barcode
          </p>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="text-[#9AA79F]">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Type the numbers printed under the barcode (UPC-A, UPC-E, EAN-8, or EAN-13).
        </p>
        <input
          type="text"
          inputMode="numeric"
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 012345678905"
          className="mt-4 w-full rounded-2xl border border-[#1B3A2D]/15 px-4 py-3 text-base text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
        />
        {manualError && <p className="mt-2 text-xs text-[#B45309]">{manualError}</p>}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setPhase('starting')}
            className="flex-1 rounded-full border border-[#1B3A2D]/15 py-3 text-sm font-medium text-[#1B3A2D]"
          >
            Use camera instead
          </button>
          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={busy || manualValue.length === 0}
            className="flex-1 rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Looking up…' : 'Look up'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'denied') {
    return (
      <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-sm text-[#6B7A72]">
          We couldn&apos;t access your camera. You can allow camera access in your browser settings,
          or enter the barcode number manually.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setPhase('starting')}
            className="rounded-full border border-[#1B3A2D]/15 px-5 py-2.5 text-sm font-medium text-[#1B3A2D]"
          >
            Try camera again
          </button>
          <button
            type="button"
            onClick={() => setPhase('manual')}
            className="rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Enter manually
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] bg-black shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <div className="relative aspect-square w-full bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

        {phase === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-1/3 w-4/5 rounded-2xl border-2 border-white/80" />
          </div>
        )}

        {(phase === 'starting' || busy) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <p className="text-sm font-medium text-white">
              {busy ? 'Looking up product…' : 'Starting camera…'}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))}
          aria-label="Switch camera"
          className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white backdrop-blur"
        >
          <SwitchCamera className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>

        {torchSupported && (
          <button
            type="button"
            onClick={toggleTorch}
            aria-label="Toggle flashlight"
            className="absolute left-3 top-3 rounded-full bg-black/40 p-2 text-white backdrop-blur"
          >
            {torchOn ? (
              <FlashlightOff className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Flashlight className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      <p className="bg-white px-4 py-2 text-center text-xs text-[#6B7A72]">
        Center the barcode in the frame — it scans automatically.
      </p>

      <div className="flex items-center justify-center gap-3 bg-white p-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 rounded-full border border-[#1B3A2D]/15 px-4 py-2.5 text-sm font-medium text-[#1B3A2D]"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => setPhase('manual')}
          className="flex items-center gap-2 rounded-full bg-[#1B3A2D]/[0.06] px-4 py-2.5 text-sm font-medium text-[#1B3A2D]"
        >
          <Keyboard className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Enter manually
        </button>
      </div>
    </div>
  );
}
