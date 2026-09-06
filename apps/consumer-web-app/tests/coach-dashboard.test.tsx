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
    listFlags: [],
    needsAttention: [],
    reliability: [],
    workingOn: null,
    inTheWay: [],
    askNext: [],
    loggedDays: 0,
    loggedDaysWindow: 21,
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

  it('says nothing needs attention, calmly, and says where that leaves her', () => {
    expect(html).toContain('Nothing needs attention right now. She is on track.');
  });

  it('names how little is logged, and over which span, rather than showing an empty reliability list', () => {
    // Build 2 (2026-08-27): the count is over the evidence window, not all
    // time, and the coach's screen now says so instead of "so far".
    expect(html).toContain('checked in on 0 days in the last 21 days');
    expect(html).toContain('nothing has been found yet');
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

  /**
   * The door was there all along and coaches walked past it. These assert
   * the three things that changed and the two that deliberately did not:
   * same route, same whole-card tap target.
   */
  describe('the way into the full client detail page says what it is', () => {
    it('names the destination in the header, with her first name', () => {
      expect(html).toContain('Full Client Detail');
      expect(html).toContain('Ebony');
      expect(html).not.toContain('Everything else about');
    });

    it('keeps the description line underneath word for word', () => {
      expect(html).toContain(
        'Her trackers, trends, assessments, programs, notes, and what her app contains. All of it,'
      );
      expect(html).toContain('unchanged.');
    });

    it('carries an explicit tappable label rather than relying on the corner arrow', () => {
      expect(html).toContain('Open full detail');
    });

    it('reads as a button: the gold accent, and a filled label', () => {
      expect(html).toContain('border-[#C4A050]');
      expect(html).toContain('bg-[#C4A050]');
    });

    it('is still one tap target, so the label is not a nested button', () => {
      const card = html.slice(html.indexOf('data-detail-link="true"'));
      const openTag = card.slice(0, card.indexOf('</a>'));
      expect(openTag).not.toContain('<button');
    });

    it('has an accessible name naming the client, so a screen reader is not read an arrow', () => {
      expect(html).toContain('aria-label="Open full detail for Ebony"');
    });
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

/**
 * WORTH DISCUSSING (2026-09-05): the two systems that were telling a coach
 * the same things on two different screens now tell them once, on one.
 *
 * The persisted coach alerts were already on this page, in "What needs
 * attention". The client list's own attention reasons were only on /coach,
 * so a coach who opened a client went from a row that said "Pain
 * increasing" to a page that did not mention it. Both are now in one
 * section, and the alerts MOVED there rather than being copied: an alert
 * rendered in both places would be one fact printed twice, which is the
 * exact thing this section exists to stop.
 */
describe('worth discussing, the one merged flag section', () => {
  const alerts = {
    urgentAlerts: [
      {
        alertKey: 'repeated_safety_flags',
        tier: 'urgent_safety' as const,
        tierLabel: 'Needs a response today',
        kindLabel: 'Safety cases open',
        title: 'Safety cases open for this member',
        reason: 'She currently has 3 open Coach Review Queue cases.',
      },
    ],
    routineAlerts: [
      {
        alertKey: 'no_checkin',
        tier: 'routine_follow_up' as const,
        tierLabel: 'Routine follow-up',
        kindLabel: 'No recent check-in',
        title: 'No recent check-in',
        reason: "This member hasn't checked in for 4 days.",
      },
    ],
  };

  it('sits above what is improving, and below the safety card', () => {
    const html = render(emptyDashboard({ safetyActive: true }));
    const safety = html.indexOf('data-section="safety"');
    const worth = html.indexOf('data-section="worth-discussing"');
    const improving = html.indexOf('data-section="improving"');
    expect(safety).toBeGreaterThan(-1);
    expect(safety).toBeLessThan(worth);
    expect(worth).toBeLessThan(improving);
  });

  it('prints each alert exactly once on the whole page', () => {
    const html = render(emptyDashboard(alerts));
    const occurrences = (needle: string) => html.split(needle).length - 1;
    expect(occurrences('Safety cases open for this member')).toBe(1);
    expect(occurrences('No recent check-in')).toBe(1);
  });

  it('shows the client list flags it was handed, and says where they came from', () => {
    const html = render(emptyDashboard({ ...alerts, listFlags: ['Pain increasing'] }));
    expect(html).toContain('Also flagged on your client list');
    expect(html).toContain('Pain increasing');
    expect(html.split('Pain increasing').length - 1).toBe(1);
  });

  it('keeps urgent safety apart from routine follow-up, in that order', () => {
    const html = render(emptyDashboard(alerts));
    expect(html.indexOf('Needs a response today')).toBeLessThan(
      html.indexOf('Routine follow-up')
    );
  });

  it('says nothing is flagged, on either surface, rather than showing an empty box', () => {
    const html = render(emptyDashboard());
    expect(html).toContain('Nothing is flagged for Ebony right now, on this page or on your client list.');
  });

  it('leaves what needs attention to the interpretation findings alone', () => {
    const html = render(emptyDashboard(alerts));
    const attention = html.slice(html.indexOf('data-section="needs-attention"'));
    expect(attention).not.toContain('Safety cases open for this member');
    // And with no findings, that section still says so plainly rather than
    // going blank because the alerts left.
    expect(attention).toContain('Nothing needs attention right now. She is on track.');
  });
});

/**
 * THE BAND (2026-09-05). Program tier only, above everything but safety,
 * and absent entirely for anyone else.
 */
describe('the this week band, on the first screen', () => {
  it('is not rendered at all when there is no band to render', () => {
    const html = render(emptyDashboard());
    expect(html).not.toContain('data-section="this-week"');
  });

  it('sits above worth discussing and above what is improving when there is one', () => {
    const html = renderToStaticMarkup(
      <CoachDashboardView
        dashboard={emptyDashboard()}
        memberId="m-1"
        thisWeek={{
          window: {
            weekStart: '2026-09-04',
            from: '2026-08-29',
            to: '2026-09-04',
            label: 'Week of Aug 29 to Sep 4',
          },
          rows: [
            { key: 'checkins', label: 'Daily Reset', statement: 'Checked in on 4 of 7 days.', details: [] },
          ],
        }}
      />
    );
    const band = html.indexOf('data-section="this-week"');
    const worth = html.indexOf('data-section="worth-discussing"');
    const improving = html.indexOf('data-section="improving"');
    expect(band).toBeGreaterThan(-1);
    expect(band).toBeLessThan(worth);
    expect(worth).toBeLessThan(improving);
    expect(html).toContain('Week of Aug 29 to Sep 4');
  });
});
