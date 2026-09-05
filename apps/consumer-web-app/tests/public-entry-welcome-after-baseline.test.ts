/**
 * THE ARRIVAL WAS BOUND CORRECTLY AND SHE WAS NEVER TOLD (2026-09-05).
 *
 * WHAT HAPPENED, ON A REAL PHONE, FROM PRODUCTION ROWS. She finished
 * "Where Your Energy Goes" at 12:03, created her account at 12:05, and the
 * arrival bound to her account at 12:05:21 through the new signup link.
 * Then:
 *
 *   12:06:31  the welcome flow captured her goal
 *   12:08:15  she finished her Baseline Assessment
 *   12:09:09  she reached Home for the FIRST time
 *
 * Two rules, both correct on their own, closed every door before she had a
 * screen to read anything on. The Baseline Assessment only mentions her
 * arrival when the welcome flow captured no goal, and it had. And the
 * arrival pop-up's closer was "a Baseline exists", which by then it did.
 * The bind was perfect and completely invisible.
 *
 * WHAT CHANGED. The Baseline no longer decides WHETHER Root speaks about
 * her arrival. It decides WHICH of two things he says:
 *
 *   no Baseline yet   an invitation, recurring, with real "Maybe later" and
 *                     "Ignore" buttons, closed by the Baseline arriving.
 *                     Exactly what it always was.
 *   Baseline done     a greeting, shown once ever, pointing at her Root Map,
 *                     with one "Got it".
 *
 * These tests hold both shapes, and hold the sentence that makes the whole
 * message allowed to exist: the quiz was a first impression, not a
 * measurement.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT_WELCOME_COPY } from '@/lib/public-entry/copy';
import { getPublicEntryWelcome } from '@/lib/public-entry/welcome';

// ---------------------------------------------------------------------
// The accessor
// ---------------------------------------------------------------------

type Fake = { origin: unknown; submissions: unknown[]; submissionsError: unknown };

const fake: Fake = { origin: null, submissions: [], submissionsError: null };

vi.mock('@/lib/public-entry/data', () => ({
  getMemberOrigin: async () => fake.origin,
}));

/** Only `onboarding_submissions` is read through the client here; the origin comes from the mock above. */
const supabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        limit: async () => ({ data: fake.submissions, error: fake.submissionsError }),
      }),
    }),
  }),
} as never;

beforeEach(() => {
  fake.origin = null;
  fake.submissions = [];
  fake.submissionsError = null;
});

const ORIGIN = {
  memberId: 'm1',
  sessionId: 'sess-1',
  experienceKey: 'energy_map',
  sourceCode: null,
  sourceRaw: null,
  patternKey: 'wind_down_deficit',
  enteredAt: '2026-09-05T12:02:35.000Z',
  claimedAt: '2026-09-05T12:05:21.000Z',
  origin: 'public_acquisition',
  preliminary: true,
  bindMethod: 'signup_link',
};

describe('Root speaks about her arrival whether or not the Baseline is done', () => {
  it('says nothing at all when she did not arrive this way', async () => {
    expect(await getPublicEntryWelcome(supabase, 'm1')).toBeNull();
  });

  it('is an INVITATION while she has no Baseline', async () => {
    fake.origin = ORIGIN;
    const welcome = await getPublicEntryWelcome(supabase, 'm1');
    expect(welcome).not.toBeNull();
    expect(welcome?.hasBaseline).toBe(false);
    expect(welcome?.patternTitle).toBeTruthy();
  });

  it('is a GREETING once her Baseline exists, and is no longer silence', async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. This returned null before
    // 2026-09-05, which is why a real member was bound to her arrival and
    // never told a word about it.
    fake.origin = ORIGIN;
    fake.submissions = [{ id: 'sub-1' }];
    const welcome = await getPublicEntryWelcome(supabase, 'm1');
    expect(welcome).not.toBeNull();
    expect(welcome?.hasBaseline).toBe(true);
    expect(welcome?.sessionId).toBe('sess-1');
  });

  it('a reassessment adding a second submission is still just "she has one"', async () => {
    fake.origin = ORIGIN;
    fake.submissions = [{ id: 'sub-1' }, { id: 'sub-2' }];
    expect((await getPublicEntryWelcome(supabase, 'm1'))?.hasBaseline).toBe(true);
  });

  it('fails towards silence when the submissions table cannot be read', async () => {
    // An unreadable table is not evidence either way, and the wrong
    // direction is inviting somebody to start what she already finished.
    fake.origin = ORIGIN;
    fake.submissionsError = { message: 'boom' };
    expect(await getPublicEntryWelcome(supabase, 'm1')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------

describe('what each shape actually says', () => {
  const PATTERN = 'The gap before the dip';

  it('the invitation still points at the Baseline and names the first impression', () => {
    const body = ROOT_WELCOME_COPY.bodyWithPattern(PATTERN);
    expect(body).toContain(PATTERN);
    expect(body).toContain('first impression');
    expect(body).toContain('not a measurement');
    expect(ROOT_WELCOME_COPY.ctaLabel).toBe('Start my Baseline Assessment');
  });

  it('the greeting points at her Root Map and asks nothing of her', () => {
    const body = ROOT_WELCOME_COPY.settled.bodyWithPattern(PATTERN);
    expect(body).toContain(PATTERN);
    expect(ROOT_WELCOME_COPY.settled.ctaLabel).toBe('See my Root Map');
    expect(ROOT_WELCOME_COPY.settled.dismissLabel).toBe('Got it');
    // It must never invite her to start something she has finished.
    expect(body).not.toContain('is where the real picture starts');
  });

  it('the greeting still refuses to call a two minute quiz a measurement', () => {
    // The whole licence to speak about a public answer at all is that it is
    // named as a preliminary impression. A finished Baseline does not make
    // that sentence optional.
    expect(ROOT_WELCOME_COPY.settled.bodyWithPattern(PATTERN)).toContain('not a measurement');
  });

  it('neither shape invents a pattern for somebody who did not finish', () => {
    expect(ROOT_WELCOME_COPY.bodyWithoutPattern).toContain('did not finish');
    expect(ROOT_WELCOME_COPY.settled.bodyWithoutPattern).toContain('did not finish');
  });

  it('holds no em dash anywhere a member reads it', () => {
    const em = String.fromCharCode(0x2014);
    const all = [
      ROOT_WELCOME_COPY.title,
      ROOT_WELCOME_COPY.eyebrow,
      ROOT_WELCOME_COPY.ctaLabel,
      ROOT_WELCOME_COPY.bodyWithPattern(PATTERN),
      ROOT_WELCOME_COPY.bodyWithoutPattern,
      ROOT_WELCOME_COPY.settled.ctaLabel,
      ROOT_WELCOME_COPY.settled.dismissLabel,
      ROOT_WELCOME_COPY.settled.bodyWithPattern(PATTERN),
      ROOT_WELCOME_COPY.settled.bodyWithoutPattern,
    ];
    for (const line of all) expect(line.includes(em)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The pop-up that renders it
// ---------------------------------------------------------------------
//
// ASSERTED AGAINST THE SOURCE, and that is deliberate rather than lazy.
// RootMessagePopupClient pulls in five 'use server' action modules and the
// whole dashboard pop-up surface; standing all of that up to read two
// button labels would test the fixtures more than the branch. What has to
// hold is structural, and structure is exactly what a source assertion can
// hold: the greeting is in the auto-dismiss-on-mount group, it renders the
// settled copy, and it does NOT offer a choice it cannot honour.

describe('the greeting renders as a greeting, not as an invitation', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'components/dashboard/RootMessagePopupClient.tsx'),
    'utf-8'
  );

  it('is marked dismissed the instant it mounts, which is what "once ever" means here', () => {
    expect(source).toContain('const isSettledWelcome =');
    expect(source).toMatch(
      /if \(isOffer \|\| isPriorityCard \|\| isWeeklyReview \|\| isTrialArc \|\| isSettledWelcome\)/
    );
  });

  it('renders the settled copy and her Root Map, with one "Got it"', () => {
    const branch = source.slice(source.indexOf('if (message.hasBaseline) {'));
    expect(branch).toContain('ROOT_WELCOME_COPY.settled.bodyWithPattern');
    expect(branch).toContain('ROOT_WELCOME_COPY.settled.bodyWithoutPattern');
    expect(branch).toContain('ROOT_WELCOME_COPY.settled.ctaLabel');
    expect(branch).toContain('dismissLabel={ROOT_WELCOME_COPY.settled.dismissLabel}');
  });

  it('offers no "Maybe later" and no "Ignore", because neither would be true', () => {
    const branch = source.slice(
      source.indexOf('if (message.hasBaseline) {'),
      source.indexOf('ctaLabel={ROOT_WELCOME_COPY.ctaLabel}')
    );
    expect(branch).not.toContain('onMaybeLater');
    expect(branch).not.toContain('onIgnore');
  });

  it('and the invitation keeps both, unchanged', () => {
    const invitation = source.slice(source.indexOf('ctaLabel={ROOT_WELCOME_COPY.ctaLabel}'));
    expect(invitation.slice(0, 400)).toContain('onMaybeLater={handleMaybeLater}');
    expect(invitation.slice(0, 400)).toContain('onIgnore={handleIgnore}');
  });

  it('the chain gives the greeting the once-ever lifetime on both due-checks', () => {
    const chain = readFileSync(
      path.join(__dirname, '..', 'app/actions/rootPopupMessages.ts'),
      'utf-8'
    );
    // The branch that decides which message to return.
    expect(chain).toContain('welcome.arc || welcome.hasBaseline');
    // And the re-check the pop-up makes again before it is shown, so a
    // second tab cannot resurrect a greeting the first one already spent.
    expect(chain).toContain(
      "(message.kind === 'public_entry_welcome' && (message.arc || message.hasBaseline))"
    );
    // Her Root Map, not the assessment she has already finished.
    expect(chain).toContain("? '/root-map'");
  });
});
