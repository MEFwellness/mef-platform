import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import {
  extractFrameBuffer,
  assessFrameQuality,
  pickMidpointTimestamp,
} from '../lib/your-move/frameExtraction';

const execFileAsync = promisify(execFile);

describe('pickMidpointTimestamp', () => {
  it('picks the true midpoint when duration is known', () => {
    expect(pickMidpointTimestamp(10)).toBe(5);
  });

  it('falls back to a fixed guess past the first frame when duration is unknown', () => {
    expect(pickMidpointTimestamp(null)).toBeGreaterThan(0);
    expect(pickMidpointTimestamp(undefined)).toBeGreaterThan(0);
    expect(pickMidpointTimestamp(0)).toBeGreaterThan(0);
  });
});

describe('extractFrameBuffer + assessFrameQuality — real ffmpeg + sharp, no mocks', () => {
  let dir: string;
  let sharpVideoPath: string;
  let blackVideoPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'your-move-frame-test-'));
    sharpVideoPath = path.join(dir, 'testsrc.mp4');
    blackVideoPath = path.join(dir, 'black.mp4');

    await execFileAsync(ffmpegPath as string, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=320x240:rate=10',
      sharpVideoPath,
    ]);
    await execFileAsync(ffmpegPath as string, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:size=320x240:duration=2',
      blackVideoPath,
    ]);
  }, 30000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('extracts a real JPEG frame (starts with the JPEG magic bytes) from a real video file', async () => {
    const buffer = await extractFrameBuffer(sharpVideoPath, 1.0);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
  });

  it('rates a sharp, well-lit synthetic test pattern as usable', async () => {
    const buffer = await extractFrameBuffer(sharpVideoPath, 1.0);
    const result = await assessFrameQuality(buffer);
    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
  });

  it('rejects a black frame as unusable (poor lighting) — proves the quality gate actually rejects, not just always passes', async () => {
    const buffer = await extractFrameBuffer(blackVideoPath, 1.0);
    const result = await assessFrameQuality(buffer);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('poor_lighting');
  });
}, 30000);
