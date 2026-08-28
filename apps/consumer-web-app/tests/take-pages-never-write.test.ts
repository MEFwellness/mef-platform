/**
 * A TAKE URL ONLY EVER READS (2026-08-27).
 *
 * Every take page in this app used to create the member's draft as a side
 * effect of rendering, so opening the URL and starting the questionnaire
 * were the same act. A read-only page load during the 2026-08-27 bug sweep
 * created a real, empty, 91-question draft on a real member's production
 * account, and the same thing happened on a refresh, a bookmark, a
 * Back-then-Forward, and the re-render that a Server Action causes when
 * she finishes. Once the draft existed the Questionnaires card changed its
 * own call to action to "Resume assessment, 0 of 91 questions completed".
 *
 * Two halves are asserted here, and both matter:
 *
 *   1. The runtime and the store CAN still create, but only when asked.
 *      `createIfMissing: false` is a real read path that returns
 *      'no_session' and writes nothing. Behavioural, against real
 *      Supabase.
 *   2. No take page reaches a creating function at all. Structural,
 *      because "this render does not write" is a property of the file,
 *      and the only honest way to test it for eight route files is to
 *      read them.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { startOrResumeSession } from '../lib/assessment-runtime';
import { CVS_KEY } from '../lib/core-values-snapshot/constants';

const memberId = TEST_USERS.memberOne.id;

function read(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}

async function countSessions(): Promise<number> {
  const service = serviceRoleClient();
  const { count } = await service
    .from('unified_assessment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId);
  return count ?? 0;
}

afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('unified_assessment_sessions').delete().eq('member_id', memberId);
});

describe('the runtime read path writes nothing', () => {
  it('reports no_session and creates no row when there is nothing to resume', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const before = await countSessions();

    const result = await startOrResumeSession(client, memberId, CVS_KEY, {
      createIfMissing: false,
    });

    expect(result.status).toBe('no_session');
    expect(await countSessions()).toBe(before);
  });

  it('called twice in a row, the way a Back-then-Forward calls it, still creates nothing', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const before = await countSessions();

    await startOrResumeSession(client, memberId, CVS_KEY, { createIfMissing: false });
    await startOrResumeSession(client, memberId, CVS_KEY, { createIfMissing: false });

    expect(await countSessions()).toBe(before);
  });

  it('resumes a real draft without creating a second one', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const started = await startOrResumeSession(client, memberId, CVS_KEY);
    expect(started.status).toBe('started');
    const afterStart = await countSessions();
    expect(afterStart).toBe(1);

    const resumed = await startOrResumeSession(client, memberId, CVS_KEY, {
      createIfMissing: false,
    });
    expect(resumed.status).toBe('resumed');
    expect(await countSessions()).toBe(afterStart);
  });

  it('the explicit start path still creates, so this is a real read/write split and not a disabled feature', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    expect(await countSessions()).toBe(0);

    const started = await startOrResumeSession(client, memberId, CVS_KEY);

    expect(started.status).toBe('started');
    expect(await countSessions()).toBe(1);
  });
});

/**
 * Every take route in the app. If a ninth is added, add it here: this list
 * is the point, because the fault this file exists for was a flow that
 * nobody remembered to apply the fix to.
 */
const TAKE_PAGES = [
  'app/assessments/[questionnaireId]/take/page.tsx',
  'app/assessments/primal-pattern-diet-type/take/page.tsx',
  'app/assessments/wbsa/take/page.tsx',
  'app/assessments/core-values-snapshot/take/page.tsx',
  'app/assessments/life-signal-check/take/page.tsx',
  'app/assessments/readiness-pulse/take/page.tsx',
];

/** Every function that can bring a session or draft into existence. */
const CREATING_FUNCTIONS = [
  'getOrCreateInProgressAssessment',
  'getOrCreateInProgressPrimalPatternAssessment',
  'startOrResumeSession',
  'beginRuntimeAssessment',
  'insertAssessment',
];

describe('no take page can reach a function that creates a session', () => {
  it.each(TAKE_PAGES)('%s calls nothing that writes', (page) => {
    const source = read(page);
    for (const fn of CREATING_FUNCTIONS) {
      expect(source, `${page} must not call ${fn} during render`).not.toContain(fn);
    }
  });

  it.each(TAKE_PAGES)('%s reads through a load/resume entry point instead', (page) => {
    const source = read(page);
    expect(source).toMatch(/load\w*TakeSessionAction|getMy\w*Take\w*State/);
  });

  it.each(TAKE_PAGES)('%s sends her somewhere real when there is nothing to resume', (page) => {
    const source = read(page);
    expect(source).toContain('redirect(');
    // Never to /login. Being signed in was never the problem; having
    // nothing to resume was, and the answer to that is the overview.
    expect(source).not.toMatch(/if \(!state\) redirect\('\/login'\)/);
  });

  it('no take page carries a ?retake= query parameter any more, because a GET cannot start a retake', () => {
    for (const page of TAKE_PAGES) {
      expect(read(page), `${page} still reads a retake query param`).not.toContain('retake');
    }
  });
});

describe('starting is a button, and a button posts', () => {
  const OVERVIEW_PAGES = [
    'app/assessments/[questionnaireId]/page.tsx',
    'app/assessments/primal-pattern-diet-type/page.tsx',
    'app/assessments/wbsa/page.tsx',
    'app/assessments/core-values-snapshot/page.tsx',
    'app/assessments/life-signal-check/page.tsx',
    'app/assessments/readiness-pulse/page.tsx',
  ];

  it.each(OVERVIEW_PAGES)('%s offers a form, not a link, to begin', (page) => {
    const source = read(page);
    expect(source).toContain('BeginAssessmentForm');
  });

  it.each(OVERVIEW_PAGES)('%s never links straight to the take route', (page) => {
    const source = read(page);
    expect(source).not.toMatch(/href=\{[^}]*\/take'/);
  });

  it('the form component really is a form posting to a Server Action', () => {
    const source = read('components/assessments/BeginAssessmentForm.tsx');
    expect(source).toContain('<form action={action}');
    expect(source).toContain('type="submit"');
  });

  it('the retake on a finished experience is its own action, not a link', () => {
    const source = read('components/assessments/CompletedExperienceActions.tsx');
    expect(source).toContain('retakeAction');
    expect(source).toContain('BeginAssessmentForm');
    expect(source).not.toContain('retakeHref');
  });
});

describe('B4: the router decision is logged when an attempt starts, never on a render', () => {
  it('recordRouterDecision is not reachable from the take-state read', () => {
    const source = read('app/actions/assessments.ts');
    const start = source.indexOf('export async function getMyTakeAssessmentState');
    const readFn = source.slice(start, source.indexOf('\n}\n', start));
    expect(readFn).not.toContain('recordRouterDecision');
    expect(readFn).not.toContain('decideNextAction');
    expect(readFn).not.toContain('getOrCreateInProgressAssessment');
  });

  it('it is logged from the begin path, and only for a genuinely new attempt', () => {
    const source = read('app/actions/assessments.ts');
    expect(source).toContain('const isNewAttempt = existing === null');
    expect(source).toMatch(/if \(isNewAttempt && chosenKey\)/);
  });
});
