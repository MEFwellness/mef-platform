/**
 * The gate, the resume model, and the delivery wiring.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RED_FLAGS, SECTIONS, SCHEMA_SQL_PATH, readSql } from './body-systems-fixture';
import { resolveBodySystemsAccess } from '../lib/body-systems/access';
import { buildSteps, clampStepIndex, lastQuestionStepIndex } from '../lib/body-systems/steps';
import { bodySystemsPopupMessageKey } from '../lib/root-popup-messages/data';
import { listAssignableTemplates } from '../lib/assignments/assignableCatalog';
import { ASSESSMENT_RESULT_ANCHORS } from '../lib/coach-detail/assessmentStatus';
import { assignmentNameFor } from '../lib/assignments/experienceNames';
import {
  BODY_SYSTEMS_DEFAULT_DUE_IN_DAYS,
  BODY_SYSTEMS_DEFINITION_ID,
  BODY_SYSTEMS_KEY,
  BODY_SYSTEMS_LABEL,
} from '../lib/body-systems/constants';
import type { BodySystemsSessionRecord } from '../lib/body-systems/data';

const ROOT = path.resolve(__dirname, '..');

const assignment = { id: 'a1', createdAt: '2026-09-01T00:00:00.000Z', reason: null, dueAt: null };
const session = { id: 's1', completedAt: '2026-09-02T00:00:00.000Z' } as BodySystemsSessionRecord;

describe('the assignment is the whole gate', () => {
  it('offers it to a member with an open assignment', () => {
    expect(
      resolveBodySystemsAccess({
        assignmentRead: { ok: true, assignment },
        sessionRead: { ok: true, records: [] },
      })
    ).toEqual({ kind: 'assigned', assignment });
  });

  it('offers nothing to a member who was never assigned it', () => {
    expect(
      resolveBodySystemsAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
  });

  it('gives a finished member her own reading back rather than turning her away', () => {
    expect(
      resolveBodySystemsAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: true, records: [session] },
      })
    ).toEqual({ kind: 'completed', session });
  });

  it('fails shut when a read did not work', () => {
    expect(
      resolveBodySystemsAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [session] },
      }).kind
    ).toBe('none');
    expect(
      resolveBodySystemsAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });

  it('has no tier check, no visibility key and no second flag anywhere in the feature', () => {
    const files = fs
      .readdirSync(path.join(ROOT, 'lib/body-systems'))
      .map((name) => fs.readFileSync(path.join(ROOT, 'lib/body-systems', name), 'utf8'))
      .join('\n');
    const withoutComments = files.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/minLevel/);
    expect(withoutComments).not.toMatch(/visibilityKey/i);
    expect(withoutComments).not.toMatch(/membership_tier/);
  });
});

describe('the screens', () => {
  const steps = buildSteps(SECTIONS, RED_FLAGS);

  it('are eleven sections, then six red flags, then the results', () => {
    expect(steps.filter((step) => step.kind === 'section')).toHaveLength(11);
    expect(steps.filter((step) => step.kind === 'red_flag')).toHaveLength(6);
    expect(steps[steps.length - 1]!.kind).toBe('results');
    // The red flags come LAST, before only the results.
    expect(steps[10]!.kind).toBe('section');
    expect(steps[11]!.kind).toBe('red_flag');
  });

  it('count progress in sections, one of eleven', () => {
    const first = steps[0];
    expect(first).toMatchObject({ kind: 'section', sectionNumber: 1, sectionCount: 11 });
    const eleventh = steps[10];
    expect(eleventh).toMatchObject({ kind: 'section', sectionNumber: 11, sectionCount: 11 });
  });

  it('submit on the last red flag screen, never on the results screen', () => {
    expect(lastQuestionStepIndex(steps)).toBe(steps.length - 2);
    expect(steps[lastQuestionStepIndex(steps)]!.kind).toBe('red_flag');
  });

  it('clamp a stored position rather than trusting it', () => {
    expect(clampStepIndex(steps, 4)).toBe(4);
    expect(clampStepIndex(steps, -3)).toBe(0);
    expect(clampStepIndex(steps, 9999)).toBe(lastQuestionStepIndex(steps));
    expect(clampStepIndex(steps, Number.NaN)).toBe(0);
  });
});

describe('the coach can send it, and the app knows where its results live', () => {
  it('is in the one list of what a coach can assign', () => {
    const row = listAssignableTemplates().find((template) => template.id === BODY_SYSTEMS_KEY);
    expect(row).toBeTruthy();
    expect(row?.definitionId).toBe(BODY_SYSTEMS_DEFINITION_ID);
    expect(row?.displayName).toBe(BODY_SYSTEMS_LABEL);
    // A null assignKey routes it to its own action, which holds its own
    // default due date. It is not "not sendable".
    expect(row?.assignKey).toBeNull();
  });

  it('is dispatched to its own action by the one inline Assign button', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'app/actions/coachAssessmentRowAssign.ts'),
      'utf8'
    );
    expect(source).toContain(`'${BODY_SYSTEMS_KEY}': assignBodySystemsSurveyAction,`);
  });

  it('defaults to a due date seven days out', () => {
    expect(BODY_SYSTEMS_DEFAULT_DUE_IN_DAYS).toBe(7);
  });

  it('is named once, in the shared map', () => {
    expect(assignmentNameFor(BODY_SYSTEMS_DEFINITION_ID)).toBe(BODY_SYSTEMS_LABEL);
  });

  it('points its status row at the card its results render on', () => {
    expect(ASSESSMENT_RESULT_ANCHORS[BODY_SYSTEMS_KEY]).toBe('detail-card-body-systems');
    const page = fs.readFileSync(
      path.join(ROOT, 'app/coach/clients/[id]/detail/page.tsx'),
      'utf8'
    );
    expect(page).toContain('id="detail-card-body-systems"');
  });
});

describe('the pop-up and the receipt', () => {
  it('scopes its dismissal to the assignment, so a fresh sending is a fresh message', () => {
    expect(bodySystemsPopupMessageKey('abc')).toBe('body_systems:abc');
    expect(bodySystemsPopupMessageKey('abc')).not.toBe(bodySystemsPopupMessageKey('def'));
  });

  it('checks its own due-ness inside its own branch, per the chain rule', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/actions/rootPopupMessages.ts'), 'utf8');
    const branch = source.slice(
      source.indexOf('const bodySystems = await getMyBodySystemsSurvey();'),
      source.indexOf('// Owning Your Value, immediately below')
    );
    expect(branch).toContain('isRecurringMessageDue(messageKey)');
    // The return is INSIDE the due check, so the branch falls through when
    // the message is already dismissed rather than starving what is below.
    const dueAt = branch.indexOf('isRecurringMessageDue');
    const returnAt = branch.indexOf('return {');
    expect(returnAt).toBeGreaterThan(dueAt);
  });

  it('carries the delivery receipt on both real presentations', () => {
    const card = fs.readFileSync(
      path.join(ROOT, 'components/body-systems/BodySystemsEntry.tsx'),
      'utf8'
    );
    expect(card).toContain('presentation="home_card"');
    const popup = fs.readFileSync(
      path.join(ROOT, 'components/dashboard/RootMessagePopupClient.tsx'),
      'utf8'
    );
    const branch = popup.slice(popup.indexOf("if (message.kind === 'body_systems_assigned')"));
    expect(branch.slice(0, 900)).toContain('presentation="popup"');
  });
});

describe('a render never writes', () => {
  it('is true of every read path in this feature', () => {
    const dir = path.join(ROOT, 'lib/body-systems');
    for (const name of fs.readdirSync(dir)) {
      // data.ts is the only module allowed to write, and it is only ever
      // called from the server actions behind her buttons.
      if (name === 'data.ts') continue;
      const source = fs.readFileSync(path.join(dir, name), 'utf8');
      const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(withoutComments, `${name} writes`).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
    }
  });

  it('is true of the route, which reads and renders and nothing else', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/body-systems/page.tsx'), 'utf8');
    const withoutComments = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
    expect(withoutComments).not.toMatch(/Action\(/);
  });
});

describe('the schema', () => {
  const schema = readSql(SCHEMA_SQL_PATH);

  it('gives the association library no member read policy at all', () => {
    const policies = schema
      .split('\n')
      .filter((line) => line.includes('on body_systems_associations'));
    expect(policies.some((line) => line.includes('staff_read'))).toBe(true);
    expect(policies.some((line) => line.includes('member_'))).toBe(false);
  });

  it('makes a completion write once', () => {
    expect(schema).toContain(
      'using (member_id = auth.uid() and completed_at is null)'
    );
  });

  it('requires a pending assignment before a sitting can be written at all', () => {
    const insert = schema.slice(
      schema.indexOf('create policy member_insert_own_body_systems_sessions'),
      schema.indexOf('create policy member_update_own_unfinished_body_systems_sessions')
    );
    expect(insert).toContain("a.status = 'pending'");
    expect(insert).toContain(BODY_SYSTEMS_DEFINITION_ID);
  });
});
