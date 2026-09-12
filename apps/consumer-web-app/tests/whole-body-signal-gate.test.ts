/**
 * The gate, the screens, the resume model, the delivery wiring, and the
 * two rules a render must never break.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveWbsAccess } from '../lib/whole-body-signal/access';
import {
  buildSteps,
  clampStepIndex,
  completedSectionCount,
  completionStepIndex,
  resumeStepIndex,
  routingSectionKey,
} from '../lib/whole-body-signal/steps';
import { wholeBodySignalPopupMessageKey } from '../lib/root-popup-messages/data';
import { PROTECTED_POPUP_KINDS } from '../lib/root-popup-messages/oneKnock';
import { listAssignableTemplates } from '../lib/assignments/assignableCatalog';
import { ASSESSMENT_RESULT_ANCHORS } from '../lib/coach-detail/assessmentStatus';
import { assignmentNameFor } from '../lib/assignments/experienceNames';
import { MEMBER_ONLY_PREFIXES } from '../lib/auth/staffRouting';
import { PRODUCT_SURFACES } from '../lib/analytics/surfaces';
import { DETAIL_SECTIONS } from '../lib/coach-detail/sections';
import {
  WBS_DEFAULT_DUE_IN_DAYS,
  WBS_DEFINITION_ID,
  WBS_KEY,
  WBS_LABEL,
  WBS_ROUTE,
} from '../lib/whole-body-signal/constants';
import type { WbsSessionRecord } from '../lib/whole-body-signal/data';
import {
  BRANCH_RULES,
  QUESTIONS,
  SECTIONS,
  readSql,
  WBS_SCHEMA_SQL_PATH,
  answerAll,
} from './whole-body-signal-fixture';

const ROOT = path.resolve(__dirname, '..');

const assignment = { id: 'a1', createdAt: '2026-09-01T00:00:00.000Z', reason: null, dueAt: null };
const session = { id: 's1', completedAt: '2026-09-02T00:00:00.000Z' } as WbsSessionRecord;

describe('the assignment is the whole gate', () => {
  it('offers it to a member with an open assignment', () => {
    expect(
      resolveWbsAccess({
        assignmentRead: { ok: true, assignment },
        sessionRead: { ok: true, records: [] },
      })
    ).toEqual({ kind: 'assigned', assignment });
  });

  it('offers nothing to a member who was never assigned it', () => {
    expect(
      resolveWbsAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
  });

  it('gives a finished member her own reading back rather than turning her away', () => {
    expect(
      resolveWbsAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: true, records: [session] },
      })
    ).toEqual({ kind: 'completed', session });
  });

  it('FAILS SHUT when a read did not work', () => {
    expect(
      resolveWbsAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [session] },
      }).kind
    ).toBe('none');
    expect(
      resolveWbsAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });

  it('has no tier check, no visibility key and no second flag anywhere in the feature', () => {
    const dir = path.join(ROOT, 'lib/whole-body-signal');
    for (const name of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, name), 'utf8');
      const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(withoutComments, name).not.toMatch(/minLevel|membership_tier|visibilityKey|hasVisibility/);
    }
  });

  it('is in no self-serve list: the route is member-only and reached by the card and the pop-up', () => {
    expect(MEMBER_ONLY_PREFIXES).toContain(WBS_ROUTE);
  });
});

describe('the screens', () => {
  const steps = buildSteps({
    sections: SECTIONS,
    questions: QUESTIONS,
    branchRules: BRANCH_RULES,
    routingOptionKey: 'changing',
  });

  it('opens and closes every section with its own beat, and ends on the completion screen', () => {
    expect(steps[0]).toMatchObject({ kind: 'section_intro', sectionNumber: 1, sectionCount: 9 });
    expect(steps[steps.length - 1]).toEqual({ kind: 'completion' });
    expect(steps.filter((step) => step.kind === 'section_intro').length).toBe(9);
    // Eight beats between nine sections. The ninth closes into the
    // completion screen instead, because there is no next section to name.
    expect(steps.filter((step) => step.kind === 'section_complete').length).toBe(8);
  });

  it('ONE QUESTION PER SCREEN, which is this instrument deliberate exception', () => {
    const questionSteps = steps.filter((step) => step.kind === 'question');
    const refs = questionSteps.map((step) => (step.kind === 'question' ? step.questionRef : ''));
    expect(new Set(refs).size).toBe(refs.length);
    // "My cycles are changing" is the branch that opens every one of
    // Section 8's questions, so this member is asked all ninety six.
    expect(questionSteps.length).toBe(96);
  });

  it('puts the routing screen between Section 8 own intro and its first question', () => {
    expect(routingSectionKey(QUESTIONS)).toBe('hormone_pelvic_rhythm');
    const routingAt = steps.findIndex((step) => step.kind === 'routing');
    expect(steps[routingAt - 1]).toMatchObject({
      kind: 'section_intro',
      sectionKey: 'hormone_pelvic_rhythm',
    });
    expect(steps[routingAt + 1]).toMatchObject({
      kind: 'question',
      sectionKey: 'hormone_pelvic_rhythm',
    });
  });

  it('counts progress in sections and, separately, within a section', () => {
    for (const step of steps) {
      if (step.kind !== 'question') continue;
      expect(step.sectionCount).toBe(9);
      expect(step.indexInSection).toBeGreaterThanOrEqual(1);
      expect(step.indexInSection).toBeLessThanOrEqual(step.countInSection);
    }
  });

  it('grows and shrinks Section 8 with her branch, and leaves every other section alone', () => {
    const short = buildSteps({
      sections: SECTIONS,
      questions: QUESTIONS,
      branchRules: BRANCH_RULES,
      routingOptionKey: 'none_apply',
    });
    const shortQuestions = short.filter((step) => step.kind === 'question').length;
    const longQuestions = steps.filter((step) => step.kind === 'question').length;
    expect(longQuestions - shortQuestions).toBe(6);
  });

  it('clamps a stored position rather than trusting it', () => {
    expect(clampStepIndex(steps, -4)).toBe(0);
    expect(clampStepIndex(steps, 9999)).toBe(completionStepIndex(steps));
    expect(clampStepIndex(steps, Number.NaN)).toBe(0);
  });
});

describe('save and resume', () => {
  const steps = buildSteps({
    sections: SECTIONS,
    questions: QUESTIONS,
    branchRules: BRANCH_RULES,
    routingOptionKey: null,
  });

  it('a member who has answered nothing starts at the very beginning', () => {
    expect(resumeStepIndex({ steps, answers: {}, routingOptionKey: null })).toBe(0);
    expect(steps[0]).toMatchObject({ kind: 'section_intro', sectionNumber: 1 });
  });

  it('A SECTION SHE HAS NOT STARTED OPENS ON ITS OWN BEAT, not on its first question', () => {
    const answers: Record<string, string> = {};
    for (const question of QUESTIONS.filter((q) => q.sectionKey === 'fuel_quality')) {
      answers[question.questionRef] = 'often';
    }
    const at = resumeStepIndex({ steps, answers, routingOptionKey: null });
    expect(steps[at]).toMatchObject({ kind: 'section_intro', sectionKey: 'fuel_rhythm' });
  });

  it('NEVER RESTARTS: she comes back to the first thing she has not answered', () => {
    const answers = { FQ1: 'often', FQ2: 'never', FQ3: 'rarely' };
    const at = resumeStepIndex({ steps, answers, routingOptionKey: null });
    const step = steps[at]!;
    expect(step.kind).toBe('question');
    expect(step.kind === 'question' && step.questionRef).toBe('FQ4');
  });

  it('a SECTION SHE IS PARTWAY THROUGH resumes on the question, not on its intro', () => {
    const answers = { FQ1: 'often', FQ2: 'never' };
    const at = resumeStepIndex({ steps, answers, routingOptionKey: null });
    expect(steps[at]).toMatchObject({ kind: 'question', questionRef: 'FQ3' });
  });

  it('opens Section 8 on its own beat, and the routing screen is the next thing after it', () => {
    const answers = answerAll(null, 'often');
    const at = resumeStepIndex({ steps, answers, routingOptionKey: null });
    expect(steps[at]).toMatchObject({
      kind: 'section_intro',
      sectionKey: 'hormone_pelvic_rhythm',
    });
    expect(steps[at + 1]!.kind).toBe('routing');
  });

  it('RESUMES INSIDE SECTION 8 on the question she stopped at, once her branch is chosen', () => {
    // Her branch is answered, so the step list now genuinely holds that
    // branch's questions and her position is a real place in it.
    const branched = buildSteps({
      sections: SECTIONS,
      questions: QUESTIONS,
      branchRules: BRANCH_RULES,
      routingOptionKey: 'menopause',
    });
    const answers = { ...answerAll(null, 'often'), HPT1: 'often' };
    const at = resumeStepIndex({ steps: branched, answers, routingOptionKey: 'menopause' });
    expect(branched[at]).toMatchObject({
      kind: 'question',
      sectionKey: 'hormone_pelvic_rhythm',
      questionRef: 'HPT2',
    });
  });

  it('a member who has answered everything lands on the completion screen', () => {
    const full = buildSteps({
      sections: SECTIONS,
      questions: QUESTIONS,
      branchRules: BRANCH_RULES,
      routingOptionKey: 'menopause',
    });
    const at = resumeStepIndex({
      steps: full,
      answers: answerAll('menopause', 'often'),
      routingOptionKey: 'menopause',
    });
    expect(full[at]).toEqual({ kind: 'completion' });
  });

  it('counts only the sections she genuinely finished, for the Welcome back line', () => {
    const answers: Record<string, string> = {};
    for (const question of QUESTIONS.filter((q) => q.sectionKey === 'fuel_quality')) {
      answers[question.questionRef] = 'often';
    }
    answers.FR1 = 'often';
    expect(
      completedSectionCount({
        sections: SECTIONS,
        questions: QUESTIONS,
        branchRules: BRANCH_RULES,
        answers,
        routingOptionKey: null,
      })
    ).toBe(1);
  });

  it('does not count a section she has not been asked at all', () => {
    expect(
      completedSectionCount({
        sections: SECTIONS,
        questions: QUESTIONS,
        branchRules: BRANCH_RULES,
        answers: {},
        routingOptionKey: null,
      })
    ).toBe(0);
  });
});

describe('the coach can send it, and the app knows where its results live', () => {
  it('is findable in the assign-section questionnaire search, by name and by area', () => {
    const row = listAssignableTemplates().find((template) => template.id === WBS_KEY);
    expect(row).toBeTruthy();
    expect(row!.definitionId).toBe(WBS_DEFINITION_ID);
    expect(row!.displayName).toBe(WBS_LABEL);
    // A null key means its own action sends it, with its own default due
    // date, rather than a second insert path.
    expect(row!.assignKey).toBeNull();
  });

  it('is dispatched to its own action by the one inline Assign button', () => {
    const dispatcher = fs.readFileSync(
      path.join(ROOT, 'app/actions/coachAssessmentRowAssign.ts'),
      'utf8'
    );
    expect(dispatcher).toContain(`'${WBS_KEY}': assignWholeBodySignalAction`);
  });

  it('defaults to a due date seven days out, editable by the coach', () => {
    expect(WBS_DEFAULT_DUE_IN_DAYS).toBe(7);
    const action = fs.readFileSync(path.join(ROOT, 'app/actions/wholeBodySignal.ts'), 'utf8');
    expect(action).toContain('options?.dueDate');
    expect(action).toContain('WBS_DEFAULT_DUE_IN_DAYS');
  });

  it('is named once, in the shared map, so no screen prints the generic word', () => {
    expect(assignmentNameFor(WBS_DEFINITION_ID)).toBe(WBS_LABEL);
  });

  it('points its status row at the card its results render on, and that card is indexed', () => {
    const anchor = ASSESSMENT_RESULT_ANCHORS[WBS_KEY];
    expect(anchor).toBe('detail-card-whole-body-signal');
    const cards = DETAIL_SECTIONS.flatMap((section) => section.cards);
    expect(cards.some((card) => card.id === anchor && card.title === WBS_LABEL)).toBe(true);
  });

  it('renders that card on the coach client detail page under the same id', () => {
    const page = fs.readFileSync(
      path.join(ROOT, 'app/coach/clients/[id]/detail/page.tsx'),
      'utf8'
    );
    expect(page).toContain('id="detail-card-whole-body-signal"');
    expect(page).toContain('<WholeBodySignalPanel state={wholeBodySignalPanel} />');
  });
});

describe('the pop-up and the receipt', () => {
  it('scopes its dismissal to the assignment, so a fresh sending is a fresh message', () => {
    expect(wholeBodySignalPopupMessageKey('abc')).toBe('whole_body_signal:abc');
    expect(wholeBodySignalPopupMessageKey('abc')).not.toBe(
      wholeBodySignalPopupMessageKey('def')
    );
  });

  it('DOES NOT SHARE A PREFIX WITH THE BODY SYSTEMS SURVEY', () => {
    expect(wholeBodySignalPopupMessageKey('abc').startsWith('body_systems:')).toBe(false);
  });

  it('is a coach assignment, so it is never delayed by the one-knock rule', () => {
    expect(PROTECTED_POPUP_KINDS).toContain('whole_body_signal_assigned');
  });

  it('CHECKS ITS OWN DUE-NESS INSIDE ITS OWN BRANCH, per the chain rule', () => {
    const chain = fs.readFileSync(path.join(ROOT, 'app/actions/rootPopupMessages.ts'), 'utf8');
    const branch = chain.slice(
      chain.indexOf('const wholeBodySignal = await getMyWholeBodySignal();')
    );
    const branchBody = branch.slice(0, branch.indexOf('\n\n  //'));
    expect(branchBody).toContain('isRecurringMessageDue(messageKey)');
    // The return is INSIDE the due check, so a branch that is not due falls
    // through rather than returning a candidate the outer check throws away.
    const dueAt = branchBody.indexOf('isRecurringMessageDue');
    const returnAt = branchBody.indexOf('return {');
    expect(returnAt).toBeGreaterThan(dueAt);
  });

  it('carries the delivery receipt on both real presentations, and on no render', () => {
    const card = fs.readFileSync(
      path.join(ROOT, 'components/whole-body-signal/WholeBodySignalEntry.tsx'),
      'utf8'
    );
    expect(card).toContain('<TrackAssignmentDelivered assignmentId={assignmentId} presentation="home_card" />');

    const popup = fs.readFileSync(
      path.join(ROOT, 'components/dashboard/RootMessagePopupClient.tsx'),
      'utf8'
    );
    const branch = popup.slice(popup.indexOf("message.kind === 'whole_body_signal_assigned'"));
    const branchBody = branch.slice(0, branch.indexOf('\n  if (message.kind'));
    expect(branchBody).toContain('presentation="popup"');

    // The route itself writes no receipt: a page a member merely loaded is
    // not the assignment reaching her.
    const page = fs.readFileSync(path.join(ROOT, 'app/whole-body-signal/page.tsx'), 'utf8');
    expect(page).not.toContain('TrackAssignmentDelivered');
  });

  it('ONCE ONLY, and the database decides it rather than the client', () => {
    const tracker = fs.readFileSync(
      path.join(ROOT, 'components/assignments/TrackAssignmentDelivered.tsx'),
      'utf8'
    );
    expect(tracker).toContain('const fired = useRef(false)');
    expect(tracker).toContain('if (fired.current) return;');
    expect(tracker).toContain('claimAssignmentDelivery');
  });
});

describe('a render never writes', () => {
  it('is true of every read path in this feature', () => {
    const dir = path.join(ROOT, 'lib/whole-body-signal');
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
    const page = fs.readFileSync(path.join(ROOT, 'app/whole-body-signal/page.tsx'), 'utf8');
    const withoutComments = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
    expect(withoutComments).not.toMatch(/Action\(/);
  });

  it('is true of the Home card, which draws an invitation and claims nothing', () => {
    const card = fs.readFileSync(
      path.join(ROOT, 'components/whole-body-signal/WholeBodySignalEntry.tsx'),
      'utf8'
    );
    const withoutComments = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
    expect(withoutComments).not.toMatch(/Action\(/);
  });
});

describe('the analytics surface', () => {
  it('is registered, so a member opening it is counted once and a staff account never is', () => {
    expect(PRODUCT_SURFACES).toContain('whole_body_signal');
    const page = fs.readFileSync(path.join(ROOT, 'app/whole-body-signal/page.tsx'), 'utf8');
    expect(page).toContain('<TrackSurfaceView surface="whole_body_signal" />');
  });
});

describe('the schema', () => {
  const schema = readSql(WBS_SCHEMA_SQL_PATH);

  it('gives the three practitioner tables no member read policy at all', () => {
    for (const table of [
      'whole_body_signal_zones',
      'whole_body_signal_patterns',
      'whole_body_signal_coaching_questions',
    ]) {
      const policies = schema.split('\n').filter((line) => line.includes(`on ${table}`));
      expect(policies.some((line) => line.includes('staff_read')), table).toBe(true);
      expect(policies.some((line) => line.includes('member_')), table).toBe(false);
      expect(policies.some((line) => line.includes('authenticated_read')), table).toBe(false);
    }
  });

  it('makes a completion write once', () => {
    expect(schema).toContain('using (member_id = auth.uid() and completed_at is null)');
  });

  it('requires a pending assignment before a sitting can be written at all', () => {
    const insert = schema.slice(
      schema.indexOf('create policy member_insert_own_wbs_sessions'),
      schema.indexOf('create policy member_update_own_unfinished_wbs_sessions')
    );
    expect(insert).toContain("a.status = 'pending'");
    expect(insert).toContain(WBS_DEFINITION_ID);
  });

  it('keeps the coach focus and the coach question marks off a member session entirely', () => {
    for (const table of [
      'member_whole_body_signal_focus',
      'member_whole_body_signal_question_actions',
    ]) {
      const policies = schema.split('\n').filter((line) => line.includes(`on ${table}`));
      expect(policies.length).toBeGreaterThan(0);
      expect(policies.some((line) => line.includes('member_read')), table).toBe(false);
    }
  });

  it('lets a test account clear its own sittings, so a live walk leaves production clean', () => {
    expect(schema).toContain('test_member_delete_own_wbs_sessions');
  });

  it('joins the attempt ledger, which is what closes the assignment out', () => {
    expect(schema).toContain("'member_whole_body_signal_sessions'");
    expect(schema).toContain('sync_assessment_attempt_after_wbs_session');
  });

  it('TOUCHES NEITHER OF THE INSTRUMENTS IT SITS BESIDE', () => {
    // The only place either is named is the assessment_attempts source
    // table check, which is re-added additively with every existing value
    // kept. Nothing here alters, updates or drops another instrument own
    // tables, and nothing here reads their content.
    expect(schema).not.toMatch(/alter table (body_systems_|unified_assessment_)/);
    expect(schema).not.toMatch(/update (body_systems_|unified_assessment_)/);
    expect(schema).not.toMatch(/drop table/);
    expect(schema).not.toMatch(/create policy [a-z_]+ on body_systems_/);
    expect(schema).toContain("'member_body_systems_sessions'");
  });
});
