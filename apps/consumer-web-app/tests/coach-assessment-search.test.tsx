/**
 * THE ASSIGNABLE LIBRARY: NAMED, FILED, MATCHED, AND PLACED.
 *
 * Written for the searchable Assign panel on 2026-09-06. That panel is
 * gone: since 2026-09-08 the same questionnaires are rows in the coach's
 * Assessment Status block, grouped by where this client stands on each
 * one, and the typing happens in the page's own pinned search. What the
 * panel was built on did not change at all, so everything in this file
 * that is about lib/assignments/assignableCatalog.ts is untouched, and the
 * assertions that were about the panel's own DOM now render the block.
 *
 * Four things are worth proving, and this file proves each of them against
 * the real registry and the real rendered HTML rather than against a
 * fixture of its own invention:
 *
 *   1. THE AREA MAP KEEPS UP. Matching on an area only works while every
 *      registry category has words. A new questionnaire arriving with a
 *      category nobody named fails here, not on a coach's screen.
 *   2. THE FILTER MATCHES ON BOTH FIELDS. A name, and an area. The area
 *      case is asserted with a word that appears in NO display name, so a
 *      test that only ever matched names could not pass it.
 *   3. THE STATUS ON A ROW IS THE PAGE'S OWN STATUS. Character for
 *      character, the sentence the server wrote for that assignment, read
 *      back rather than rebuilt, so the two halves of one screen can never
 *      tell a coach two different things.
 *   4. EVERY QUESTIONNAIRE IS PLACED, ONCE. Nineteen templates go in and
 *      nineteen rows come out, spread over exactly three groups.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { AssessmentStatusBlock } =
  await import('@/app/coach/clients/[id]/detail/AssessmentStatusBlock');
const { groupAssessmentsByStatus, assessmentStatusCounts } =
  await import('@/lib/coach-detail/assessmentStatus');
const {
  NOT_SENT_STATUS_LINE,
  currentAssignmentFor,
  filterAssignableTemplates,
  listAssignableTemplates,
  templateMatchesSearch,
  templateStatusLine,
  templatesMissingAName,
} = await import('@/lib/assignments/assignableCatalog');
const { assessmentAreaLabel, assessmentCategoriesInUse, knownAreaCategories } =
  await import('@/lib/assessment-registry/areas');
const { assignmentNameRecord } = await import('@/lib/assignments/experienceNames');
const { assignmentStatusLine, resolveAssignmentProgress } =
  await import('@/lib/assignments/status');
const { WYJL_LABEL } = await import('@/lib/where-your-joy-lives/copy');
const { OYV_LABEL } = await import('@/lib/owning-your-value/copy');
const { STRESS_LOAD_LABEL } = await import('@/lib/stress-load/copy');

type AssessmentAssignment = Awaited<
  ReturnType<typeof import('@/app/actions/assessmentAssignments').getClientAssessmentAssignments>
>[number];

const TEMPLATES = listAssignableTemplates();
const NAMES = assignmentNameRecord();

// One fixture client, in one zone, on one day. Every sentence below is
// written by the real server helper against these, so nothing in this file
// hand-writes a status string.
const TIMEZONE = 'America/New_York';
const MEMBER_TODAY = '2026-09-06';

function templateNamed(name: string) {
  const found = TEMPLATES.find((t) => t.displayName === name);
  if (!found) throw new Error(`No assignable template named "${name}"`);
  return found;
}

function assignment(input: {
  id: string;
  definitionId: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  dueAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  assignedBy?: string;
}): AssessmentAssignment {
  const progress = resolveAssignmentProgress({
    status: input.status,
    createdAt: input.createdAt,
    dueAt: input.dueAt ?? null,
    cancelledAt: input.cancelledAt ?? null,
    completedAt: input.completedAt ?? null,
    deliveredAt: input.deliveredAt ?? null,
    memberToday: MEMBER_TODAY,
  });
  return {
    id: input.id,
    assessmentDefinitionId: input.definitionId,
    assignedBy: input.assignedBy ?? 'coach-1',
    isRequired: true,
    reason: null,
    dueAt: input.dueAt ?? null,
    status: input.status,
    createdAt: input.createdAt,
    progress,
    statusLine: assignmentStatusLine(progress, { timeZone: TIMEZONE }),
  };
}

const BASELINE = templateNamed('Baseline Assessment');
const WHOLE_BODY = templateNamed('Whole-Body Check-In');
const JOY = templateNamed(WYJL_LABEL);

const FINISHED = assignment({
  id: 'a-finished',
  definitionId: BASELINE.definitionId,
  status: 'completed',
  createdAt: '2026-09-06T12:00:00.000Z',
  completedAt: '2026-09-06T18:00:00.000Z',
});
const SEEN_AND_DUE = assignment({
  id: 'a-open',
  definitionId: WHOLE_BODY.definitionId,
  status: 'pending',
  createdAt: '2026-09-06T12:00:00.000Z',
  dueAt: '2026-09-11T00:00:00.000Z',
  deliveredAt: '2026-09-06T15:00:00.000Z',
});
const SENT_UNOPENED = assignment({
  id: 'a-unopened',
  definitionId: JOY.definitionId,
  status: 'pending',
  createdAt: '2026-09-06T12:00:00.000Z',
  dueAt: '2026-09-13T00:00:00.000Z',
});
const ASSIGNMENTS = [SENT_UNOPENED, SEEN_AND_DUE, FINISHED];

/** The three groups this fixture client produces, built by the real placement rule. */
const GROUPS = groupAssessmentsByStatus(TEMPLATES, ASSIGNMENTS, NAMES);
const COUNTS = assessmentStatusCounts(GROUPS);

/** The status block as a coach sees it, rendered from those same groups. */
function renderBlock(): string {
  return renderToStaticMarkup(<AssessmentStatusBlock clientId="client-1" groups={GROUPS} />);
}

/**
 * React escapes &, <, > and ' on the way into HTML. One display name
 * carries an ampersand and another carries an apostrophe, so both have to
 * be escaped here or an assertion about a real name fails on the escaping
 * rather than on the name.
 */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#x27;');
}

/**
 * Just one group's rows, addressed by the group's own marker rather than
 * by copy. A locator that took the first text match would happily assert
 * about the wrong group and still report a pass.
 */
function group(html: string, key: 'notYetAssigned' | 'waiting' | 'completed'): string {
  const start = html.indexOf(`data-assessment-group="${key}"`);
  expect(start, key).toBeGreaterThan(-1);
  const rest = html.slice(start + 1);
  const next = rest.indexOf('data-assessment-group="');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('the area map keeps up with the library', () => {
  it('names every category the registry actually uses', () => {
    const named = new Set(knownAreaCategories());
    const missing = assessmentCategoriesInUse().filter((c) => !named.has(c));
    expect(missing).toEqual([]);
  });

  it('refuses to invent a label for a category nobody named', () => {
    expect(() => assessmentAreaLabel('not_a_real_category')).toThrow(/area label/i);
  });

  it('never files a template under a raw registry key', () => {
    for (const template of TEMPLATES) {
      expect(template.areaLabel).not.toMatch(/_/);
      expect(template.areaLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('every row is named by the shared map', () => {
  it('leaves nothing reading as the generic word', () => {
    expect(templatesMissingAName(TEMPLATES)).toEqual([]);
  });

  it('carries the three coach-assigned deep-dives under their own names', () => {
    const names = TEMPLATES.map((t) => t.displayName);
    expect(names).toContain(WYJL_LABEL);
    expect(names).toContain(OYV_LABEL);
    expect(names).toContain(STRESS_LOAD_LABEL);
  });
});

describe('the filter matches on both a name and an area', () => {
  it('finds a questionnaire by part of its name, whatever the capitals', () => {
    for (const typed of ['joy', 'JOY', '  Joy  ']) {
      expect(filterAssignableTemplates(TEMPLATES, typed).map((t) => t.displayName)).toEqual([
        WYJL_LABEL,
      ]);
    }
  });

  it('finds every questionnaire in an area, by a word that is in no name at all', () => {
    // The load-bearing assertion of this file. "happiness" appears in no
    // display name anywhere in the library, so a filter that only ever
    // looked at names would return nothing here.
    expect(TEMPLATES.filter((t) => t.displayName.toLowerCase().includes('happiness'))).toEqual([]);

    const inTheArea = TEMPLATES.filter((t) => t.areaLabel === 'Happiness').map(
      (t) => t.displayName
    );
    expect(inTheArea.length).toBeGreaterThan(1);
    expect(filterAssignableTemplates(TEMPLATES, 'happiness').map((t) => t.displayName)).toEqual(
      inTheArea
    );
  });

  it('finds every questionnaire in a second area the same way', () => {
    const area = 'Nutrition and Lifestyle';
    const inTheArea = TEMPLATES.filter((t) => t.areaLabel === area);
    expect(inTheArea.length).toBeGreaterThan(1);
    expect(filterAssignableTemplates(TEMPLATES, 'nutrition and life')).toEqual(inTheArea);
  });

  it('matches partially, from anywhere inside either field', () => {
    const template = templateNamed(WYJL_LABEL);
    expect(templateMatchesSearch(template, 'your joy')).toBe(true);
    expect(templateMatchesSearch(template, 'appines')).toBe(true);
    expect(templateMatchesSearch(template, 'sleep')).toBe(false);
  });

  it('restores the whole list when the field is cleared', () => {
    expect(filterAssignableTemplates(TEMPLATES, '')).toEqual(TEMPLATES);
    expect(filterAssignableTemplates(TEMPLATES, '   ')).toEqual(TEMPLATES);
  });

  it('returns nothing for gibberish', () => {
    expect(filterAssignableTemplates(TEMPLATES, 'qzxwv')).toEqual([]);
  });
});

describe('a row says where this client stands', () => {
  it('reads back the assignment sentence rather than writing a second one', () => {
    expect(templateStatusLine(ASSIGNMENTS, BASELINE.definitionId)).toBe(FINISHED.statusLine);
    expect(templateStatusLine(ASSIGNMENTS, WHOLE_BODY.definitionId)).toBe(SEEN_AND_DUE.statusLine);
    expect(templateStatusLine(ASSIGNMENTS, JOY.definitionId)).toBe(SENT_UNOPENED.statusLine);
  });

  it('says Not sent for a questionnaire this client has never been sent', () => {
    const untouched = TEMPLATES.find(
      (t) => !ASSIGNMENTS.some((a) => a.assessmentDefinitionId === t.definitionId)
    );
    expect(untouched).toBeTruthy();
    expect(templateStatusLine(ASSIGNMENTS, untouched!.definitionId)).toBe(NOT_SENT_STATUS_LINE);
  });

  it('prefers a still open row, then a completed one, then a withdrawn one', () => {
    const id = BASELINE.definitionId;
    const open = assignment({
      id: 'again',
      definitionId: id,
      status: 'pending',
      createdAt: '2026-09-06T20:00:00.000Z',
    });
    const withdrawn = assignment({
      id: 'gone',
      definitionId: id,
      status: 'cancelled',
      createdAt: '2026-09-06T22:00:00.000Z',
      cancelledAt: '2026-09-06T22:30:00.000Z',
    });
    expect(currentAssignmentFor([withdrawn, open, FINISHED], id)?.id).toBe('again');
    expect(currentAssignmentFor([withdrawn, FINISHED], id)?.id).toBe('a-finished');
    expect(currentAssignmentFor([withdrawn], id)?.id).toBe('gone');
    expect(currentAssignmentFor([], id)).toBeNull();
  });
});

describe('every questionnaire is placed, exactly once', () => {
  it('nineteen templates in, nineteen rows out, across three groups', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    expect(COUNTS.notYetAssigned + COUNTS.waiting + COUNTS.completed).toBe(TEMPLATES.length);
  });

  it('files each of the fixture rows by its own current assignment', () => {
    expect(GROUPS.waiting.map((r) => r.displayName)).toEqual(
      expect.arrayContaining([WHOLE_BODY.displayName, JOY.displayName])
    );
    expect(GROUPS.completed.map((r) => r.displayName)).toContain(BASELINE.displayName);
    const placedElsewhere = new Set([
      ...GROUPS.waiting.map((r) => r.id),
      ...GROUPS.completed.map((r) => r.id),
    ]);
    for (const row of GROUPS.notYetAssigned) {
      expect(placedElsewhere.has(row.id)).toBe(false);
    }
  });

  /**
   * A withdrawn assignment is not an offer. Nothing is on her screen, so
   * the row belongs beside everything else she has never been sent rather
   * than in a fourth group nobody asked for.
   */
  it('a withdrawn row reads as not yet assigned, not as waiting or completed', () => {
    const withdrawn = assignment({
      id: 'a-withdrawn',
      definitionId: JOY.definitionId,
      status: 'cancelled',
      createdAt: '2026-09-01T12:00:00.000Z',
      cancelledAt: '2026-09-02T12:00:00.000Z',
    });
    const groups = groupAssessmentsByStatus(TEMPLATES, [withdrawn], NAMES);
    expect(groups.notYetAssigned.map((r) => r.id)).toContain(JOY.id);
    expect(groups.waiting).toHaveLength(0);
    expect(groups.completed).toHaveLength(0);
  });

  it('counts overdue by the identical test that draws the Overdue chip', () => {
    const late = assignment({
      id: 'a-late',
      definitionId: WHOLE_BODY.definitionId,
      status: 'pending',
      createdAt: '2026-08-20T12:00:00.000Z',
      dueAt: '2026-08-25T00:00:00.000Z',
    });
    const counts = assessmentStatusCounts(groupAssessmentsByStatus(TEMPLATES, [late], NAMES));
    expect(counts.overdue).toBe(1);
    expect(late.progress.due.isOverdue).toBe(true);
  });
});

describe('the status block a coach actually sees', () => {
  it('is addressable by its accessible name, not by copy another card could carry', () => {
    expect(renderBlock()).toContain('aria-label="Assessment Status"');
  });

  it('prints the three groups in order, each with its own count', () => {
    const html = renderBlock();
    const notYet = html.indexOf('Not Yet Assigned');
    const waiting = html.indexOf('Assigned, Waiting');
    const completed = html.indexOf('Completed<');
    expect(notYet).toBeGreaterThan(-1);
    expect(notYet).toBeLessThan(waiting);
    expect(waiting).toBeLessThan(completed);
    expect(group(html, 'notYetAssigned')).toContain(`(${COUNTS.notYetAssigned})`);
    expect(group(html, 'waiting')).toContain(`(${COUNTS.waiting})`);
    expect(group(html, 'completed')).toContain(`(${COUNTS.completed})`);
  });

  it('every template is on screen once, with its area beside it', () => {
    const html = renderBlock();
    for (const template of TEMPLATES) {
      expect(html).toContain(esc(template.displayName));
      expect(html).toContain(esc(template.areaLabel));
    }
  });

  /**
   * The requirement the searchable panel was given, kept: the sentence on
   * a row is that assignment's own server written statusLine, read back
   * rather than a second one built here.
   */
  it('prints the server sentence on a placed row, and nothing on an unsent one', () => {
    const html = renderBlock();
    for (const [template, row] of [
      [JOY, SENT_UNOPENED],
      [WHOLE_BODY, SEEN_AND_DUE],
      [BASELINE, FINISHED],
    ] as const) {
      expect(html).toContain(row.statusLine);
      expect(templateStatusLine(ASSIGNMENTS, template.definitionId)).toBe(row.statusLine);
    }
    // The Not sent line is not printed nineteen times any more: an
    // unassigned row is in the group whose name already says it.
    expect(html).not.toContain(NOT_SENT_STATUS_LINE);
  });

  /**
   * The bloat this build removed, asserted rather than assumed. Nine
   * panels used to repeat one sentence, and every unassigned row used to
   * be a card. One line for the whole group is the maximum.
   */
  it('says the not-yet-assigned context once for the group, never once per row', () => {
    const html = renderBlock();
    const matches = html.split('is offered to them until you send it').length - 1;
    expect(matches).toBe(1);
  });

  it('offers an Assign button on an unassigned row, and none on a waiting one', () => {
    const html = renderBlock();
    expect(group(html, 'notYetAssigned')).toContain('>Assign<');
    expect(group(html, 'waiting')).not.toContain('>Assign<');
    expect(group(html, 'waiting')).toContain('>Cancel<');
  });

  /**
   * Both kinds of row are assignable, and they are assignable through
   * their own write paths. A deep-dive stores no reason and is always
   * required, so its row must still offer the button.
   */
  it('a deep-dive row is assignable too, with no reason field to fill in', () => {
    const joyRow = GROUPS.notYetAssigned.find((r) => r.id === 'stress-load-deep-dive');
    expect(joyRow).toBeDefined();
    expect(joyRow!.capability).toEqual({
      canAssign: true,
      acceptsReason: false,
      acceptsRequired: false,
      acceptsDueDate: true,
    });
    const registryRow = GROUPS.notYetAssigned.find((r) => r.assignKey !== null);
    expect(registryRow!.capability).toEqual({
      canAssign: true,
      acceptsReason: true,
      acceptsRequired: true,
      acceptsDueDate: true,
    });
  });

  it('a completed row that has a card on this page offers a way into it', () => {
    const baselineRow = GROUPS.completed.find((r) => r.id === BASELINE.id);
    expect(baselineRow!.resultsAnchorId).toBe('detail-card-baseline');
    expect(group(renderBlock(), 'completed')).toContain('View results');
  });

  it('renders no em dash anywhere a coach can read', () => {
    expect(renderBlock()).not.toContain('\u2014');
  });
});
