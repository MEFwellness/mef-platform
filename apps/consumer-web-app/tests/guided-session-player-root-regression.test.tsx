/**
 * Root Movement still works, after its player became everyone's player.
 *
 * The session screen was lifted out of MovementSessionPlayer into
 * GuidedSessionPlayer so an assigned program workout could be walked the
 * same way. That is exactly the kind of refactor that quietly changes a
 * working screen, so this renders the real Root player against real HTML
 * and asserts what a member sees: the same overview, the same lineup, the
 * same prescription lines, the same tap-to-play video, the same skip.
 *
 * It also holds the two rules the Root screen has always had, now that the
 * markup lives in a shared file: no free text anywhere in the player, and
 * no em dash or exclamation mark in anything a member reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MovementSessionDetail } from '@mef/shared-types-contracts';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {} }),
}));
vi.mock('@/app/actions/movement-sessions', () => ({
  startMovementSessionAction: async () => 'run-1',
  skipMovementExerciseAction: async () => {},
  completeMovementSessionAction: async () => {},
  trackMovementSessionViewedAction: async () => {},
}));

import { MovementSessionPlayer } from '../components/movement-sessions/MovementSessionPlayer';
import { GuidedExerciseStage } from '../components/movement-sessions/GuidedSessionPlayer';
import { formatPrescription, formatRest } from '../lib/movement-sessions/duration';

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const DETAIL: MovementSessionDetail = {
  template: {
    id: 'template-1',
    session_key: 'hip_back_reset',
    name: 'Hip and Back Reset',
    description: 'A short reset for hips and lower back.',
    target_duration_min_minutes: 10,
    target_duration_max_minutes: 12,
    sort_order: 1,
    is_active: true,
  },
  slots: [
    {
      id: 'slot-1',
      slot_order: 1,
      provider: 'your_move',
      external_id: 'ext-1',
      prescription_type: 'time',
      prescription_seconds: 45,
      prescription_reps: null,
      rest_seconds: 30,
      name: 'Hip Flexor Stretch',
      primaryMuscle: 'hip_flexors',
      category: 'mobility',
      posterUrl: 'https://example.test/posters/ext-1.jpg',
      cues: ['Tuck the pelvis under.'],
    },
    {
      id: 'slot-2',
      slot_order: 2,
      provider: 'your_move',
      external_id: 'ext-2',
      prescription_type: 'reps',
      prescription_seconds: null,
      prescription_reps: 12,
      rest_seconds: 0,
      name: 'Glute Bridge',
      primaryMuscle: 'glutes',
      category: 'strength',
      posterUrl: null,
      cues: ['Drive through the heels.'],
    },
  ],
  estimatedSeconds: 123,
};

describe('the Root Movement overview is unchanged', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the kicker, the name, the description, the duration and the count', () => {
    const html = renderToStaticMarkup(<MovementSessionPlayer detail={DETAIL} />);

    expect(html).toContain('Root Movement');
    expect(html).toContain('Hip and Back Reset');
    expect(html).toContain('A short reset for hips and lower back.');
    expect(html).toContain('10 to 12 min');
    expect(html).toContain('2 exercises');
    expect(html).toContain('Begin');
    expect(html).toContain('Sessions');
  });

  it('lists what is in it, with each prescription, exactly as before', () => {
    const html = renderToStaticMarkup(<MovementSessionPlayer detail={DETAIL} />);

    expect(html).toContain('What is in it');
    expect(html).toContain('Hip Flexor Stretch');
    expect(html).toContain('45 seconds');
    expect(html).toContain('Glute Bridge');
    expect(html).toContain('12 reps');
    // Muscle names are still shown in plain words, not in stored form.
    expect(html).toContain('hip flexors');
    expect(html).not.toContain('hip_flexors');
  });

  it('makes no video request just by opening the session', () => {
    renderToStaticMarkup(<MovementSessionPlayer detail={DETAIL} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('a Root exercise mid-session is unchanged', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the poster, the prescription, the rest and the cues, and requests nothing', () => {
    const slot = DETAIL.slots[0]!;
    const html = renderToStaticMarkup(
      <GuidedExerciseStage
        exercise={{
          key: slot.id,
          externalId: slot.external_id,
          name: slot.name,
          primaryMuscle: slot.primaryMuscle,
          category: slot.category,
          posterUrl: slot.posterUrl,
          cues: slot.cues,
          prescription: formatPrescription(slot),
          prescriptionSummary: formatPrescription(slot),
          rest: formatRest(slot),
        }}
        index={0}
        total={2}
        nextLabel="Next"
        finishLabel="Finish"
        skipLabel="Skip this one"
        onNext={() => {}}
        onSkip={() => {}}
        onLeave={() => {}}
      />
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toContain('1 of 2');
    expect(html).toContain('https://example.test/posters/ext-1.jpg');
    expect(html).toContain('aria-label="Play exercise video"');
    expect(html).toContain('45 seconds');
    expect(html).toContain('Then 30 seconds rest.');
    expect(html).toContain('Tuck the pelvis under.');
    expect(html).toContain('Next');
    expect(html).toContain('Skip this one');
    expect(html).toContain('Leave whenever you need to. Nothing is lost.');
  });

  it('says Finish on the last exercise and states no rest when there is none', () => {
    const slot = DETAIL.slots[1]!;
    const html = renderToStaticMarkup(
      <GuidedExerciseStage
        exercise={{
          key: slot.id,
          externalId: slot.external_id,
          name: slot.name,
          primaryMuscle: slot.primaryMuscle,
          category: slot.category,
          posterUrl: slot.posterUrl,
          cues: slot.cues,
          prescription: formatPrescription(slot),
          prescriptionSummary: formatPrescription(slot),
          rest: formatRest(slot),
        }}
        index={1}
        total={2}
        nextLabel="Next"
        finishLabel="Finish"
        skipLabel="Skip this one"
        onNext={() => {}}
        onSkip={() => {}}
        onLeave={() => {}}
      />
    );

    expect(html).toContain('2 of 2');
    expect(html).toContain('Finish');
    expect(html).not.toContain('Then ');
    // No poster on this one, so the generated placeholder stands in
    // rather than a broken image.
    expect(html).not.toContain('<img');
  });
});

describe('the rules the Root screen has always had', () => {
  const sources = [
    'components/movement-sessions/MovementSessionPlayer.tsx',
    'components/movement-sessions/GuidedSessionPlayer.tsx',
  ];

  it('never asks a member for free text, a reason or a rating inside the player', () => {
    for (const relative of sources) {
      const source = read(relative);
      expect(source, relative).not.toMatch(/<textarea/i);
      expect(source, relative).not.toMatch(/type="text"/i);
      expect(source, relative).not.toMatch(/why did you skip/i);
      expect(source, relative).not.toMatch(/how did that feel/i);
    }
  });

  it('keeps the voice: no em dashes and no exclamation marks in member-facing copy', () => {
    for (const relative of sources) {
      const memberFacing = read(relative)
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .join('\n');
      expect(memberFacing, relative).not.toMatch(/—/);
      expect(memberFacing, relative).not.toMatch(/!['"<]/);
    }
  });

  it('has one player, not two: the Root file renders the shared one rather than its own screen', () => {
    const source = read('components/movement-sessions/MovementSessionPlayer.tsx');
    expect(source).toMatch(/<GuidedSessionPlayer/);
    // The screen itself is not duplicated here.
    expect(source).not.toMatch(/Leave whenever you need to/);
    expect(source).not.toMatch(/Skip this one/);
  });
});
