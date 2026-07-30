/**
 * Mid-movement video-frame extraction for exercise posters (Phase 2).
 * Runs ONLY from offline build scripts (scripts/exercise-media/
 * extract-posters.ts), never from a Vercel serverless function or any
 * request path — ffmpeg is a devDependency precisely so it never has to
 * be bundled into the Next.js production runtime (see ffmpeg-static's
 * package.json entry and this repo's own sharp-as-devDependency
 * precedent, scripts/generate-brand-assets.mjs).
 *
 * Quality gating reuses lib/body-assessment/frameQuality.ts's existing
 * Laplacian-variance sharpness + luminance check verbatim (same
 * thresholds, same function) rather than inventing a second blur/exposure
 * heuristic — sharp decodes the extracted JPEG to raw RGBA so that
 * browser-oriented function can run unmodified in Node.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { computeFrameQualityStats, evaluateFrameQuality, type FrameQualityResult } from '../body-assessment/frameQuality';

const execFileAsync = promisify(execFile);

/** Duration unknown for either source is rare but possible — a fixed guess past the very first frame of a typical short exercise clip, per "not the first frame." */
const FALLBACK_TIMESTAMP_SECONDS = 1.5;

export function pickMidpointTimestamp(durationSeconds: number | null | undefined): number {
  if (!durationSeconds || durationSeconds <= 0) return FALLBACK_TIMESTAMP_SECONDS;
  return durationSeconds * 0.5;
}

/** Extracts one JPEG frame at the given timestamp from a (possibly remote) video URL — ffmpeg reads HTTP(S) input directly, no separate download step. */
export async function extractFrameBuffer(videoUrl: string, timestampSeconds: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    ffmpegPath as string,
    [
      '-ss',
      String(timestampSeconds),
      '-i',
      videoUrl,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }
  );
  return stdout;
}

/** Downsamples to the same ~64px-wide sample size the browser-side caller (CameraCapture.tsx) uses, so the exact same thresholds apply unmodified. */
export async function assessFrameQuality(jpegBuffer: Buffer): Promise<FrameQualityResult> {
  const SAMPLE_WIDTH = 64;
  const { data, info } = await sharp(jpegBuffer)
    .resize({ width: SAMPLE_WIDTH, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const stats = computeFrameQualityStats({
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  });
  return evaluateFrameQuality(stats);
}
