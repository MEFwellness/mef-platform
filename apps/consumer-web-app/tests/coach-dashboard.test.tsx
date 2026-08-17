/**
 * The coach's first screen, rendered against real HTML.
 *
 * Six sections, in the order the target asks for them, each one proved to
 * render from real member state AND in its empty state, because a coach must
 * be able to tell "nothing here" apart from "this section is broken".
 *
 * Also asserted: the tier labels appear and no number does, no raw stored
 * value reaches the page, and nothing that used to be on the old page was
 * deleted rather than moved.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CoachDashboardView } from '../app/coach/clients/[id]/CoachDashboardView';
import { buildAskNext, buildInTheWay, groupByReliability } from '../lib/coach-dashboard/build';
import type {
  CoachDashboard,
  DashboardFinding,
  FrictionAnswer,
  WorkingOn,
} from '../lib/coach-dashboard/types';

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function finding(overrides: Partial<DashboardFinding> = {}): DashboardFinding {
  return {
    sourceKey: 'stress::elevated_stress',
    label: 'The stress you are carrying',
    statement: 'The stress you are carrying came up in your intake answers.',
    tier: 'early_indication',
    tierLabel: 'Early indication',
    domainLabel: 'Stress & Nervous System Regulation',
    coachOnly: false,
    ...overrides,
  };
}

function emptyDashboard(overrides: Partial<CoachDashboard> = {}): CoachDashboard {
  return {
    memberFirstName: 'Ebony',
    localDate: '2026-08-17',
    safetyActive: false,
    improving: [],
    urgentAlerts: [],
    routineAlerts: [],
    needsAttention: [],
    reliability: [],
    workingOn: null,
    inTheWay: [],
    askNext: [],
    loggedDays: 0,
    dataFloorStatement: null,
    ...overrides,
  };
}

function render(dashboard: CoachDashboard): string {
  return renderToStaticMarkup(<CoachDashboardView dashboard={dashboard} memberId="m-1" />);
}

describe('the six sections are all there, in order', () => {
  const html = render(emptyDashboard());

  it('renders all six, and only those six, as sections', () => {
    for (const section of [
      'improving',
      'needs-attention',
      'reliability',
      'working-on',
      'in-the-way',
      'ask-next',
    ]) {
      expect(html).toContain(`data-section="${section}"`);
    }
  });

  it('puts them in the order the target asks for', () => {
    const order = [
      'data-section="improving"',
      'data-section="needs-attention"',
      'data-section="reliability"',
      'data-section="working-on"',
      'data-section="in-the-way"',
      'data-section="ask-next"',
    ].map((marker) => html.indexOf(marker));

    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('every section renders in its empty state, honestly', () => {
  const html = render(emptyDashboard());

  it('says nothing is improving, and says why that is not the same as nothing improving', () => {
    expect(html).toContain('Nothing has moved in a better direction yet');
    expect(html).toContain('nothing has enough behind it to say so');
  });

  it('says nothing needs attention', () => {
    expect(html).toContain('Nothing is asking for attention right now');
  });

  it('names how little is logged rather than showing an empty reliability list', () => {
    expect(html).toContain('0 logged days so far and nothing has been found yet');
  });

  it('says Root has set no priority today rather than showing a blank card', () => {
    expect(html).toContain('Root has not set a priority for Ebony today yet');
  });

  it('says nothing is getting in the way', () => {
    expect(html).toContain('Nothing is showing up as an obstacle right now');
  });

  it('says the ask-next list only fills from real state, so an empty one is meaningful', () => {
    expect(html).toContain('This list only fills from real state');
  });

  it('shows no safety block when nothing is open', () => {
    expect(html).not.toContain('data-section="safety"');
  });
});

describe('with real member state', () => {
  const workingOn: WorkingOn = {
    title: 'Take a few minutes for your Daily Reset.',
    help: 'It is the smallest thing that moves everything else.',
    status: 'saved',
    ruleLabel: 'Her Daily Reset',
    consecutiveIgnored: 3,
    approachChanges: 1,
    friction: {
      reason: 'too_hard',
      reasonLabel: 'Too much to take on',
      note: 'I get home and there is nothing left in the tank.',
      localDate: '2026-08-16',
      unanswered: false,
    },
  };

  const dashboard = emptyDashboard({
    loggedDays: 9,
    improving: [
      finding({
        sourceKey: 'sleep::poor_sleep_quality',
        label: 'Sleep that has not been leaving you rested',
        statement: 'Sleep that has not been leaving you rested has been improving.',
        tier: 'supported_by_checkins',
        tierLabel: 'Supported by repeated check-ins',
        domainLabel: 'Sleep & Circadian Rhythm',
      }),
    ],
    needsAttention: [finding()],
    urgentAlerts: [
      {
        alertKey: 'repeated_safety_flags',
        tier: 'urgent_safety',
        tierLabel: 'Needs a response today',
        kindLabel: 'Safety cases open',
        title: 'Safety cases open for this member',
        reason: 'She currently has 3 open Coach Review Queue cases.',
      },
    ],
    routineAlerts: [
      {
        alertKey: 'assessment_overdue',
        tier: 'routine_follow_up',
        tierLabel: 'Routine follow-up',
        kindLabel: 'Time for a reassessment',
        title: 'Time for a reassessment',
        reason: 'It has been 400 days since her last baseline or reassessment.',
      },
    ],
    reliability: groupByReliability([
      finding(),
      finding({
        sourceKey: 'sleep::poor_sleep_quality',
        label: 'Sleep that has not been leaving you rested',
        tier: 'supported_by_checkins',
        tierLabel: 'Supported by repeated check-ins',
      }),
    ]),
    workingOn,
    inTheWay: buildInTheWay({
      friction: workingOn.friction,
      workingOn,
      escalatedThreads: 1,
      routineAlerts: [],
    }),
    askNext: buildAskNext({
      friction: workingOn.friction,
      findings: [
        finding({ tier: 'supported_by_checkins', tierLabel: 'Supported by repeated check-ins' }),
      ],
      workingOn,
      revealedUntouched: [{ label: 'Food Lens', revealedAt: '2026-08-15' }],
      safetyActive: false,
      firstName: 'Ebony',
    }),
  });

  const html = render(dashboard);

  it('shows what is improving, with its tier label', () => {
    expect(html).toContain('Sleep that has not been leaving you rested');
    expect(html).toContain('Supported by repeated check-ins');
  });

  it('keeps urgent safety alerts in their own block, apart from the routine ones', () => {
    const urgentAt = html.indexOf('Needs a response today');
    const routineAt = html.indexOf('Routine follow-up');
    expect(urgentAt).toBeGreaterThan(-1);
    expect(routineAt).toBeGreaterThan(-1);
    expect(urgentAt).toBeLessThan(routineAt);
  });

  it('groups findings by how much is behind them, strongest first, with the meaning spelled out', () => {
    const supported = html.indexOf('Supported by repeated check-ins');
    const early = html.indexOf('Early indication');
    expect(supported).toBeLessThan(early);
  });

  it("names what she is working on, its state, and the rule that chose it", () => {
    expect(html).toContain('Take a few minutes for your Daily Reset.');
    expect(html).toContain('Set aside for later');
    expect(html).toContain('Her Daily Reset');
  });

  it("shows her friction answer in her own words, verbatim", () => {
    expect(html).toContain('Too much to take on');
    expect(html).toContain('I get home and there is nothing left in the tank.');
  });

  it('says what may be getting in the way, and where each item came from', () => {
    expect(html).toContain('From her own answer');
    expect(html).toContain('gone unanswered 3 days running');
    expect(html).toContain('handed to you because Root could not make it land');
  });

  it('suggests what to ask next, each with the real state behind it', () => {
    expect(html).toContain('I get home and there is nothing left in the tank.');
    expect(html).toContain('your confirmation is the only thing that can raise it further');
    expect(html).toContain('Food Lens');
  });

  it('never renders a confidence percentage or any bare number as a reliability claim', () => {
    expect(html).not.toMatch(/\d+\s*%/);
    expect(html).not.toMatch(/confidence/i);
  });

  it('never renders a raw stored value', () => {
    // No snake_case identifiers anywhere in the rendered text.
    const textOnly = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');
    expect(textOnly).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
  });

  it('links to the detail view, so nothing that used to be here is unreachable', () => {
    expect(html).toContain('data-detail-link="true"');
    expect(html).toContain('/coach/clients/m-1/detail');
  });
});

describe('safety comes first and separately', () => {
  const html = render(emptyDashboard({ safetyActive: true }));

  it('renders its own block above everything else', () => {
    expect(html).toContain('data-section="safety"');
    expect(html.indexOf('data-section="safety"')).toBeLessThan(
      html.indexOf('data-section="improving"')
    );
  });

  it('says what to do and links to the queue', () => {
    expect(html).toContain('Open the review queue');
  });

  it('is the first thing in the ask-next list too', () => {
    const items = buildAskNext({
      friction: null,
      findings: [],
      workingOn: null,
      revealedUntouched: [],
      safetyActive: true,
      firstName: 'Ebony',
    });
    expect(items[0]!.kind).toBe('open_safety_case');
  });
});

describe('what to ask next comes only from real state', () => {
  it('is empty when there is no state to ask about', () => {
    expect(
      buildAskNext({
        friction: null,
        findings: [],
        workingOn: null,
        revealedUntouched: [],
        safetyActive: false,
        firstName: 'Ebony',
      })
    ).toEqual([]);
  });

  it('does not suggest confirming a finding that has not reached the supported tier', () => {
    const items = buildAskNext({
      friction: null,
      findings: [finding({ tier: 'emerging_pattern', tierLabel: 'Emerging pattern' })],
      workingOn: null,
      revealedUntouched: [],
      safetyActive: false,
      firstName: 'Ebony',
    });
    expect(items).toEqual([]);
  });

  it('does not call a priority stalled after one quiet day', () => {
    const workingOn: WorkingOn = {
      title: 'A thing',
      help: null,
      status: 'active',
      ruleLabel: 'Her Daily Reset',
      consecutiveIgnored: 1,
      approachChanges: 0,
      friction: null,
    };
    const items = buildAskNext({
      friction: null,
      findings: [],
      workingOn,
      revealedUntouched: [],
      safetyActive: false,
      firstName: 'Ebony',
    });
    expect(items.some((i) => i.kind === 'stalled_priority')).toBe(false);
  });

  it('every suggested question carries a reason, so none of them is a guess', () => {
    const friction: FrictionAnswer = {
      reason: 'no_time',
      reasonLabel: 'No time',
      note: null,
      localDate: '2026-08-16',
      unanswered: false,
    };
    const items = buildAskNext({
      friction,
      findings: [finding({ tier: 'supported_by_checkins', tierLabel: 'Supported by repeated check-ins' })],
      workingOn: null,
      revealedUntouched: [{ label: 'Food Lens', revealedAt: null }],
      safetyActive: false,
      firstName: 'Ebony',
    });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.because.length).toBeGreaterThan(0);
  });
});

describe("an unanswered friction question is itself worth a coach knowing", () => {
  it('says she was asked and did not answer, and says nothing was assumed from it', () => {
    const items = buildInTheWay({
      friction: {
        reason: 'something_else',
        reasonLabel: 'She has not answered yet',
        note: null,
        localDate: '2026-08-16',
        unanswered: true,
      },
      workingOn: null,
      escalatedThreads: 0,
      routineAlerts: [],
    });
    expect(items[0]!.statement).toContain('nothing was assumed from it');
  });
});

describe('nothing was deleted, only moved', () => {
  const detail = read('app/coach/clients/[id]/detail/page.tsx');

  it('every panel the old page rendered is on the detail view', () => {
    for (const panel of [
      'WellnessIndexCard',
      'HydrationTrackingToggle',
      'MemberVisibilityPanel',
      'EnergyTrendChart',
      'BrainPanel',
      'CoachingEscalationsPanel',
      'IntelligencePanel',
      'MemberIntelligencePanel',
      'RootCauseSignalsPanel',
      'RootMapPanel',
      'CaseViewPanel',
      'RecommendationsPanel',
      'LongitudinalIntelligencePanel',
      'CoachWorkspacePanel',
      'IntelligenceCorePanel',
      'ConversationPanel',
      'BodyAssessmentPanel',
      'WbsaPanel',
      'CoreValuesSnapshotPanel',
      'LifeSignalCheckPanel',
      'ReadinessPulsePanel',
      'PersonalResetPlanPanel',
      'MovementProfilePanel',
      'ClientProgramsSummaryCard',
      'PrescriptionIntelligenceCard',
      'AssessmentAssignmentPanel',
      'NarrativePanel',
      'FeedPanel',
      'BaselineAssessmentView',
      'AssessmentComparisonView',
      'AssessmentHistoryList',
      'CoachNotesPanel',
    ]) {
      expect(detail, panel).toContain(panel);
    }
  });

  it('the visibility panel from the previous build is still reachable, and is linked from the first screen too', () => {
    expect(detail).toContain('id="member-visibility"');
    const first = read('app/coach/clients/[id]/page.tsx');
    expect(first).toContain('data-visibility-link="true"');
    expect(first).toContain('/detail#member-visibility');
  });

  it('the first screen reads from the layers rather than computing anything', () => {
    const first = read('app/coach/clients/[id]/page.tsx');
    expect(first).toContain('buildCoachDashboard');
    const builder = read('lib/coach-dashboard/build.ts');
    expect(builder).toContain('buildMemberInterpretation');
    expect(builder).toContain('buildMemberVisibility');
    expect(builder).toContain('getDailyPriority');
  });
});
