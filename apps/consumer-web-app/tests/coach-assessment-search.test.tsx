/**
 * THE COACH CAN TYPE INSTEAD OF SCROLL (2026-09-06).
 *
 * "Assign an Assessment" on the client detail page used to be a native
 * dropdown. The template library keeps growing, and a dropdown of names on
 * a phone gives a coach no way to type and no way to see whether the thing
 * she is about to send has already been sent, already been finished, or is
 * sitting unopened on that client's screen.
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
 *   3. THE STATUS ON A FILTERED ROW IS THE PAGE'S OWN STATUS. Character
 *      for character, the same sentence the assignment list further down
 *      the same page prints for the same client, because it is that
 *      assignment's own server written statusLine read back rather than a
 *      second one built in the picker.
 *   4. A ROW THIS PANEL CANNOT SEND IS NOT A BUTTON. The three
 *      coach-assigned deep-dives are findable here and are assigned from
 *      their own cards, so their rows carry no control at all.
 *
 * HOW A FILTERED LIST IS RENDERED WITHOUT A BROWSER. This suite runs in
 * node with no DOM, so nothing can type into the field. The panel renders
 * `filterAssignableTemplates(props, query)`, and the filter is idempotent
 * for an empty query, so handing it an already filtered list produces the
 * exact DOM typing that query produces. That is what `render(query)` below
 * does, and it is the only reason it is legitimate.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { AssessmentAssignmentPanel } =
  await import('@/app/coach/clients/[id]/AssessmentAssignmentPanel');
const {
  ASSIGNED_FROM_OWN_CARD,
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

type AssessmentAssignment = Parameters<
  typeof AssessmentAssignmentPanel
>[0]['initialAssignments'][number];

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

/**
 * The panel as it renders after typing `query`. See the header for why
 * pre-filtering the prop is the same DOM as typing.
 */
function render(query: string): string {
  return renderToStaticMarkup(
    <AssessmentAssignmentPanel
      clientId="client-1"
      assignableTemplates={filterAssignableTemplates(TEMPLATES, query)}
      assignmentsByDefinitionId={NAMES}
      initialAssignments={ASSIGNMENTS}
    />
  );
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

/** Just the searchable list, so an assertion about it cannot be satisfied by the ledger underneath. */
function picker(html: string): string {
  const start = html.indexOf('aria-label="Questionnaires for this client"');
  const end = html.indexOf('Optional reason for this client');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

/** Just the assignment ledger underneath the form, which is what this page printed before this build. */
function ledger(html: string): string {
  const start = html.indexOf('</form>');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start);
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

describe('the panel a coach actually sees', () => {
  it('puts a search field at the top of the section', () => {
    const html = render('');
    expect(html).toContain('Assign an Assessment');
    // Addressable by its accessible name, so a live check reaches this
    // card and not another panel that happens to use the same words.
    expect(html).toContain('aria-label="Assign an Assessment"');
    expect(html).toContain('Search by name or area');
    expect(html).toContain('Search questionnaires by name or area');
    // The field is above the list it filters.
    expect(html.indexOf('Search by name or area')).toBeLessThan(
      html.indexOf('aria-label="Questionnaires for this client"')
    );
  });

  it('lists every template, each with its area and this client’s standing', () => {
    const shown = picker(render(''));
    for (const template of TEMPLATES) {
      expect(shown).toContain(esc(template.displayName));
      expect(shown).toContain(esc(template.areaLabel));
      expect(shown).toContain(templateStatusLine(ASSIGNMENTS, template.definitionId));
    }
  });

  it('shows only the matches once a name is typed', () => {
    const shown = picker(render('joy'));
    expect(shown).toContain(WYJL_LABEL);
    expect(shown).not.toContain('Baseline Assessment');
    expect(shown).not.toContain('Whole-Body Check-In');
  });

  it('shows every template in an area once the area is typed', () => {
    const shown = picker(render('happiness'));
    expect(shown).toContain(esc(WYJL_LABEL));
    expect(shown).toContain(esc(OYV_LABEL));
    expect(shown).not.toContain('Baseline Assessment');
  });

  it('says so honestly when nothing matches', () => {
    const shown = picker(render('qzxwv'));
    expect(shown).toContain('Nothing here matches that.');
    expect(shown).not.toContain(WYJL_LABEL);
  });

  /**
   * The requirement this build was given, asserted as a string identity.
   * The sentence on a FILTERED row and the sentence on the SAME client's
   * assignment row underneath the form are one string, so the two halves of
   * one screen can never tell a coach two different things.
   */
  it('prints the same status sentence on a filtered row as the page prints underneath', () => {
    const unfiltered = render('');
    for (const [template, row] of [
      [JOY, SENT_UNOPENED],
      [WHOLE_BODY, SEEN_AND_DUE],
      [BASELINE, FINISHED],
    ] as const) {
      const typed = template.displayName.slice(0, 6);
      const filteredPicker = picker(render(typed));
      expect(filteredPicker).toContain(esc(template.displayName));
      expect(filteredPicker).toContain(row.statusLine);
      expect(ledger(unfiltered)).toContain(row.statusLine);
      expect(templateStatusLine(ASSIGNMENTS, template.definitionId)).toBe(row.statusLine);
    }
  });

  it('leaves the ledger underneath untouched by the filter', () => {
    expect(ledger(render('joy'))).toBe(ledger(render('')));
  });

  it('gives a row it cannot send no control at all, and says where its button is', () => {
    const shown = picker(render('joy'));
    expect(shown).toContain(ASSIGNED_FROM_OWN_CARD);
    expect(shown).not.toContain('<button');

    // A row it CAN send is still a button, exactly as the dropdown option
    // it replaced was selectable.
    const sendable = picker(render('Baseline'));
    expect(sendable).toContain('<button');
    expect(sendable).not.toContain(ASSIGNED_FROM_OWN_CARD);
  });

  it('renders no em dash anywhere a coach can read', () => {
    for (const query of ['', 'joy', 'happiness', 'qzxwv']) {
      expect(render(query)).not.toContain('—');
    }
  });
});
