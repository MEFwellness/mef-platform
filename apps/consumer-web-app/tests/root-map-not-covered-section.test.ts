/**
 * Guard tests for RootMapNotCoveredSection.tsx (2026-07-29 follow-up).
 * Static source scan — this repo's established convention for client
 * components (see tests/root-map-ring.test.ts, tests/checkin-navigation.test.ts) —
 * since there's no jsdom/RTL renderer configured in this suite
 * (vitest.config.ts's `environment: 'node'`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = readFileSync(
  path.resolve(__dirname, '../components/root-map/RootMapNotCoveredSection.tsx'),
  'utf-8'
);

describe('RootMapNotCoveredSection — shared block anchor + tapped-domain highlight (2026-07-29)', () => {
  it('is a client component (subscribes to the highlight bus, needs state)', () => {
    expect(SOURCE).toMatch(/^'use client';/);
  });

  it('carries the shared section anchor id the ring now scrolls to', () => {
    expect(SOURCE).toMatch(/id=\{NOT_COVERED_SECTION_ANCHOR_ID\}/);
    expect(SOURCE).toMatch(/from '@\/lib\/root-map\/anchors'/);
  });

  it('subscribes to highlight requests from the ring', () => {
    expect(SOURCE).toMatch(/useRootMapHighlightRequests\(setHighlighted\)/);
  });

  it('visually marks only the specific domain that was tapped', () => {
    expect(SOURCE).toMatch(/highlighted === d\.domain/);
  });

  it('clears the highlight again after a short delay rather than leaving it permanently marked', () => {
    expect(SOURCE).toMatch(/setTimeout\(\(\) => setHighlighted\(null\), HIGHLIGHT_DURATION_MS\)/);
  });
});
