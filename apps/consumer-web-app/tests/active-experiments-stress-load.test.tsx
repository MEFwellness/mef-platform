/**
 * The Active Experiments section, rendered for real, with a Stress & Load
 * Deep-Dive experiment running.
 *
 * WHY THIS FILE EXISTS. Accepting the offer at the end of the deep-dive has
 * always written a real lifestyle_experiments row, but nothing on the
 * dashboard ever read it back: this section reads three per-experience
 * statuses plus a Recommendation Engine list filtered on
 * `recommendationId !== null`, and a deep-dive experiment carries a null
 * recommendationId by design, so it fell through every branch. A member
 * ran a seven day experiment with no card. These tests fail if that
 * happens again.
 *
 * The second describe block is the control: Owning Your Value's card is
 * asserted character for character, on its own and beside its new
 * neighbour, because the one thing this build was not allowed to do was
 * change it.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Every action this section calls, replaced. The section is a server
// component whose entire job is deciding WHICH statuses are worth
// rendering, so the statuses are exactly what a test should control.
const cvsStatus = vi.fn(async () => null);
const cvsOffer = vi.fn(async () => null);
const lscStatus = vi.fn(async () => null);
const lscOffer = vi.fn(async () => null);
const rplStatus = vi.fn(async () => null);
const rplOffer = vi.fn(async () => null);
const oyvStatus = vi.fn<() => Promise<unknown>>(async () => null);
const wyjlStatus = vi.fn<() => Promise<unknown>>(async () => null);
const slStatus = vi.fn<() => Promise<unknown>>(async () => null);
const lifestyleExperiments = vi.fn(async () => [] as unknown[]);

vi.mock('@/app/actions/coreValuesSnapshot', () => ({
  getMyCvsExperimentStatusAction: () => cvsStatus(),
  getMyCvsOfferAction: () => cvsOffer(),
}));
vi.mock('@/app/actions/lifeSignalCheck', () => ({
  getMyLscExperimentStatusAction: () => lscStatus(),
  getMyLscOfferAction: () => lscOffer(),
}));
vi.mock('@/app/actions/readinessPulse', () => ({
  getMyRplExperimentStatusAction: () => rplStatus(),
  getMyRplOfferAction: () => rplOffer(),
}));
vi.mock('@/app/actions/owningYourValue', () => ({
  getMyOwningYourValueExperimentAction: () => oyvStatus(),
  logOwningYourValueDayAction: async () => ({ ok: true }),
}));
vi.mock('@/app/actions/whereYourJoyLives', () => ({
  getMyWhereYourJoyLivesExperimentAction: () => wyjlStatus(),
  logWhereYourJoyLivesDayAction: async () => ({ ok: true }),
}));
vi.mock('@/app/actions/stressLoad', () => ({
  getMyStressLoadExperimentAction: () => slStatus(),
  logStressLoadDayAction: async () => ({ ok: true }),
}));
vi.mock('@/app/actions/lifestyleExperiments', () => ({
  getMyLifestyleExperiments: () => lifestyleExperiments(),
}));
vi.mock('@/app/actions/rootPopupMessages', () => ({
  getMyRootPopupDismissalAction: async () => null,
}));
vi.mock('@/app/actions/rootMap', () => ({
  localDateFor: async () => '2026-09-06',
}));
vi.mock('@/lib/supabase/currentUser', () => ({ getCachedUser: async () => null }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));

const { ActiveExperimentsSection } = await import(
  '@/components/dashboard/ActiveExperimentsSection'
);
const { buildStressLoadExperiment, stressLoadDailyQuestion, stressLoadExperimentTitles } =
  await import('@/lib/stress-load/experiment');
const { OYV_EXPERIMENT_DAILY_QUESTION, buildOyvExperiment } = await import(
  '@/lib/owning-your-value/experiment'
);
const { fullAnswers } = await import('./stress-load-questions.test');

/** The experiment a member who said music restores her actually gets. */
const SL_OFFER = buildStressLoadExperiment(
  fullAnswers({ recovery_sources: { selected: ['music', 'outside'], otherText: null } })
)!;

function experimentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    memberId: 'm-1',
    recommendationId: null,
    sourceSessionId: null,
    sourceExperienceKey: 'stress-load-deep-dive',
    day7AcknowledgedAt: null,
    title: SL_OFFER.title,
    protocol: SL_OFFER.protocol,
    startDate: '2026-09-03',
    durationDays: 7,
    status: 'active',
    reflectionText: null,
    outcome: null,
    closedAt: null,
    createdAt: '2026-09-03T09:00:00.000Z',
    ...overrides,
  };
}

function stressLoadStatus(overrides: Record<string, unknown> = {}) {
  return {
    experiment: experimentRow(),
    todayLocalDate: '2026-09-06',
    daysSinceStart: 3,
    dailyQuestion: stressLoadDailyQuestion(SL_OFFER.title),
    todayCompleted: null,
    ...overrides,
  };
}

function owningYourValueStatus(overrides: Record<string, unknown> = {}) {
  const offer = buildOyvExperiment();
  return {
    experiment: experimentRow({
      id: 'exp-oyv',
      sourceExperienceKey: 'owning-your-value',
      title: offer.title,
      protocol: offer.protocol,
      startDate: '2026-09-05',
    }),
    todayLocalDate: '2026-09-06',
    daysSinceStart: 1,
    todayCompleted: null,
    ...overrides,
  };
}

async function render(): Promise<string> {
  const element = await ActiveExperimentsSection();
  return element === null ? '' : renderToStaticMarkup(element);
}

function reset() {
  slStatus.mockResolvedValue(null);
  oyvStatus.mockResolvedValue(null);
  wyjlStatus.mockResolvedValue(null);
}

describe('an accepted Stress & Load experiment shows up on Home', () => {
  it('renders nothing at all when she has none of anything', async () => {
    reset();
    expect(await render()).toBe('');
  });

  it('renders the section, and her card, when the only thing running is Stress & Load', async () => {
    reset();
    slStatus.mockResolvedValue(stressLoadStatus());
    const html = await render();

    expect(html).toContain('Active Experiments');
    expect(html).toContain('data-experiment="stress-load-deep-dive"');
  });

  it('shows the day counter, counting from her start date, not from zero', async () => {
    reset();
    slStatus.mockResolvedValue(stressLoadStatus());
    expect(await render()).toContain('Day 4 of 7');
  });

  it('shows the daily question her own protocol asks, not a generic one', async () => {
    reset();
    slStatus.mockResolvedValue(stressLoadStatus());
    const html = await render();

    expect(html).toContain(
      'Did you give five minutes to music with your full attention on it today?'
    );
    // Not the sibling's question, which is what a copy-paste would leave behind.
    expect(html).not.toContain(OYV_EXPERIMENT_DAILY_QUESTION);
  });

  it('offers Yes and Not today while today is unanswered', async () => {
    reset();
    slStatus.mockResolvedValue(stressLoadStatus());
    const html = await render();

    expect(html).toContain('>Yes<');
    expect(html).toContain('>Not today<');
  });

  it('replaces both buttons with the logged confirmation once she has answered', async () => {
    reset();
    slStatus.mockResolvedValue(stressLoadStatus({ todayCompleted: true }));
    const yes = await render();
    expect(yes).toContain('Logged: today counted.');
    expect(yes).not.toContain('>Not today<');

    slStatus.mockResolvedValue(stressLoadStatus({ todayCompleted: false }));
    const no = await render();
    expect(no).toContain('Logged: not today, and that is fine.');
    expect(no).not.toContain('>Yes<');
  });

  it('never counts past the last day of the run', async () => {
    reset();
    slStatus.mockResolvedValue(stressLoadStatus({ daysSinceStart: 40 }));
    expect(await render()).toContain('Day 7 of 7');
  });

  it('reads the acceptance that was already recorded, whenever it was recorded', async () => {
    // A row created before this build looks exactly like a row created
    // after it: the status action reads lifestyle_experiments by
    // source_experience_key, so honouring an older acceptance needs no
    // backfill and no migration.
    reset();
    slStatus.mockResolvedValue(
      stressLoadStatus({
        experiment: experimentRow({ createdAt: '2026-08-29T09:00:00.000Z' }),
      })
    );
    expect(await render()).toContain('data-experiment="stress-load-deep-dive"');
  });
});

describe('Owning Your Value is untouched', () => {
  it('renders exactly what it always did when it is the only thing running', async () => {
    reset();
    oyvStatus.mockResolvedValue(owningYourValueStatus());
    const html = await render();

    expect(html).toContain('Active Experiments');
    expect(html).toContain(OYV_EXPERIMENT_DAILY_QUESTION);
    expect(html).toContain('Day 2 of 7');
    expect(html).toContain('>Yes<');
    expect(html).toContain('>Not today<');
    expect(html).not.toContain('data-experiment="stress-load-deep-dive"');
  });

  it('keeps its own logged state wording', async () => {
    reset();
    oyvStatus.mockResolvedValue(owningYourValueStatus({ todayCompleted: true }));
    expect(await render()).toContain('Logged: today counted.');
  });

  it('renders side by side with Stress & Load, each with its own question', async () => {
    reset();
    oyvStatus.mockResolvedValue(owningYourValueStatus());
    slStatus.mockResolvedValue(stressLoadStatus());
    const html = await render();

    expect(html).toContain(OYV_EXPERIMENT_DAILY_QUESTION);
    expect(html).toContain(
      'Did you give five minutes to music with your full attention on it today?'
    );
    // One section heading, two cards under it.
    expect(html.split('Active Experiments').length - 1).toBe(1);
  });
});

describe('every experiment this deep-dive can start has a written daily question', () => {
  const titles = stressLoadExperimentTitles();

  it('covers all eleven of them, with no fallback sentence reaching a member', () => {
    expect(titles.length).toBe(11);
    for (const title of titles) {
      const question = stressLoadDailyQuestion(title);
      const fallback = `Did you take ${title.charAt(0).toLowerCase()}${title.slice(1)} today?`;
      expect(question, `${title} has no written question`).not.toBe(fallback);
      expect(question.endsWith('today?'), `${title}: ${question}`).toBe(true);
      expect(question).not.toContain('—');
    }
  });

  it('still answers for a title nobody wrote a question for, rather than throwing', () => {
    expect(stressLoadDailyQuestion('Five minutes of something new')).toBe(
      'Did you take five minutes of something new today?'
    );
  });
});
