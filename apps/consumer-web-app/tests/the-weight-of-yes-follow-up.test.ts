/**
 * The follow-up: the one genuinely new mechanism in this build.
 *
 * FIVE THINGS ARE PROVED HERE, and the third is the one that matters most.
 *
 * 1. BOTH MODES OF QUESTION ONE. A member with a completed earlier sitting
 *    gets the follow-up wording with her own deposit quoted verbatim. A
 *    member without one gets the standalone wording. Nothing else about the
 *    nine questions changes in either direction.
 *
 * 2. WHEN THE CHECK HAPPENS. Delivery time, not assignment time: an earlier
 *    sitting finished after the assignment landed but before she opened
 *    this one still counts. Once she has written a word, the STORED flag
 *    decides, so nothing rewrites a question she has already answered.
 *
 * 3. STANDALONE MODE MENTIONS NOTHING. A member who never did the earlier
 *    template must find zero evidence anywhere that it exists. This is
 *    asserted twice over: against every member-facing STRING this feature
 *    can produce in standalone mode, and against the SOURCE of every
 *    member-facing component, which cannot name it because it is never
 *    given it.
 *
 * 4. THE FLAG RECORDS WHAT RAN. It is written on the insert, from the
 *    server's own read, and never from anything the client posts.
 *
 * 5. THE COACH SEES BOTH ANSWERS. The band is coach-only, names the earlier
 *    template, and pairs the deposit that was standing when she wrote this
 *    sitting with what she wrote at question one.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildTwoyState } from '@/lib/the-weight-of-yes/service';
import { TWOY_KEY } from '@/lib/the-weight-of-yes/constants';
import { TGL_KEY } from '@/lib/the-giving-ledger/constants';
import {
  TWOY_QUESTIONS,
  TWOY_FOLLOW_UP_KEY,
  followUpPromptFor,
  promptFor,
} from '@/lib/the-weight-of-yes/questions';
import {
  TWOY_CLOSING_LABEL,
  TWOY_CLOSING_LINE,
  TWOY_COACH_COPY,
  TWOY_COPY,
  TWOY_INTRO_BODY_LINES,
  TWOY_RESOURCE,
  TWOY_SECTIONS,
} from '@/lib/the-weight-of-yes/copy';
import {
  TWOY_EXPERIMENT_ACTION,
  TWOY_EXPERIMENT_DAILY_QUESTION,
  buildTwoyExperiment,
} from '@/lib/the-weight-of-yes/experiment';
import { depositForSitting } from '@/lib/the-weight-of-yes/followUp';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MEMBER = '66666666-6666-4666-8666-666666666666';

const DEPOSIT = 'an hour on Sunday morning to myself, without anyone needing anything';

type World = {
  assignment: Record<string, unknown> | null;
  sessions: Array<Record<string, unknown>>;
};

const world: World = { assignment: null, sessions: [] };
let sessionFilters: Array<[string, unknown]> = [];
let writes: string[] = [];

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    assignment_id: 'assignment-1',
    experience_key: TWOY_KEY,
    questions_version: 1,
    answers: {},
    kind_no: null,
    deposit_request: null,
    follow_up_source_experience_key: null,
    started_at: '2026-09-06T10:00:00.000Z',
    completed_at: null,
    created_at: '2026-09-06T10:00:00.000Z',
    ...overrides,
  };
}

function givingLedgerRow(overrides: Record<string, unknown> = {}) {
  return row({
    id: 'tgl-1',
    assignment_id: 'assignment-tgl',
    experience_key: TGL_KEY,
    answers: { deposit_to_ask_for: DEPOSIT },
    deposit_request: DEPOSIT,
    completed_at: '2026-09-01T09:00:00.000Z',
    ...overrides,
  });
}

/** Honours the experience_key filter, so the two templates cannot bleed. */
function fakeClient() {
  const builder = (table: string): Record<string, unknown> => {
    let rows: Array<Record<string, unknown>> =
      table === 'assessment_assignments'
        ? world.assignment
          ? [world.assignment]
          : []
        : table === 'member_happiness_deep_dive_sessions'
          ? world.sessions
          : [];

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'is', 'neq', 'gte', 'lte', 'order', 'limit']) {
      chain[method] = () => chain;
    }
    chain.not = (column: string) => {
      if (table === 'member_happiness_deep_dive_sessions' && column === 'completed_at') {
        rows = rows.filter((entry) => entry.completed_at !== null);
      }
      return chain;
    };
    chain.eq = (column: string, value: unknown) => {
      if (table === 'member_happiness_deep_dive_sessions') {
        sessionFilters.push([column, value]);
        rows = rows.filter((entry) => entry[column] === undefined || entry[column] === value);
      }
      return chain;
    };
    chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
    return chain;
  };

  return {
    from(table: string) {
      return {
        ...builder(table),
        insert: () => {
          writes.push(`insert:${table}`);
          return builder(table);
        },
        update: () => {
          writes.push(`update:${table}`);
          return builder(table);
        },
        upsert: async () => {
          writes.push(`upsert:${table}`);
          return { error: null };
        },
        delete: () => {
          writes.push(`delete:${table}`);
          return builder(table);
        },
      };
    },
    async rpc() {
      return { data: null, error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const OPEN_ASSIGNMENT = {
  id: 'assignment-1',
  created_at: '2026-09-06T09:00:00.000Z',
  reason: null,
  due_at: null,
};

beforeEach(() => {
  world.assignment = OPEN_ASSIGNMENT;
  world.sessions = [];
  sessionFilters = [];
  writes = [];
});

describe('question one, in both of its modes', () => {
  it('runs as a follow-up when a completed earlier sitting exists, quoting her verbatim', async () => {
    world.sessions = [givingLedgerRow()];
    const state = await buildTwoyState(fakeClient(), MEMBER);

    expect(state?.status).toBe('pending');
    const followUp = state?.status === 'pending' ? state.followUp : null;
    expect(followUp).toEqual({ sourceExperienceKey: TGL_KEY, depositRequest: DEPOSIT });

    const prompt = promptFor(TWOY_QUESTIONS[0]!, followUp);
    expect(prompt).toBe(
      `Last time, you told Root you could ask someone for this: ${DEPOSIT}. Did you ask? What happened, or what stopped you?`
    );
    // Her words are inside it exactly as she wrote them.
    expect(prompt).toContain(DEPOSIT);
  });

  it('runs standalone when there is no completed earlier sitting', async () => {
    world.sessions = [];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    const followUp = state?.status === 'pending' ? state.followUp : null;
    expect(followUp).toBeNull();
    expect(promptFor(TWOY_QUESTIONS[0]!, followUp)).toBe(
      'Think of the last time you said yes when everything in you wanted to say no. What was the request, and what did the yes cost you?'
    );
  });

  it('runs standalone when the earlier sitting is only a draft', async () => {
    // An unfinished earlier sitting is not a completed one, and quoting a
    // draft answer back at her would be quoting something she never
    // finished saying.
    world.sessions = [givingLedgerRow({ completed_at: null })];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp).toBeNull();
  });

  it('runs standalone when the earlier sitting left the deposit empty', async () => {
    world.sessions = [givingLedgerRow({ deposit_request: '   ', answers: {} })];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp).toBeNull();
  });

  it('changes question one and nothing else', async () => {
    world.sessions = [givingLedgerRow()];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    const followUp = state?.status === 'pending' ? state.followUp : null;

    for (const question of TWOY_QUESTIONS.slice(1)) {
      expect(promptFor(question, followUp)).toBe(question.prompt);
    }
    // And the adapting question is the first one, by key, not by position
    // in some other list.
    expect(TWOY_QUESTIONS[0]?.key).toBe(TWOY_FOLLOW_UP_KEY);
  });

  it('does not double the punctuation when she ended on a sentence herself', () => {
    expect(followUpPromptFor('a whole evening off.')).toContain('a whole evening off. Did you ask?');
    expect(followUpPromptFor('a whole evening off')).toContain('a whole evening off. Did you ask?');
    // Whitespace around her answer is trimmed, and nothing inside it is.
    expect(followUpPromptFor('  help  with   the school run  ')).toContain(
      'help  with   the school run.'
    );
  });
});

describe('when the check happens', () => {
  it('is delivery time: an earlier sitting finished AFTER the assignment still counts', async () => {
    // The assignment landed on the 6th. The earlier sitting was finished on
    // the 7th, a day later. She opens this one after that, and the
    // follow-up runs.
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [givingLedgerRow({ completed_at: '2026-09-07T09:00:00.000Z' })];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp?.depositRequest).toBe(DEPOSIT);
  });

  it('is settled by the stored flag once her sitting exists', async () => {
    // She started before the earlier sitting was finished, so her row
    // records a standalone question one. Finishing that earlier template
    // mid-sitting must NOT rewrite the question she already answered.
    world.sessions = [
      row({ answers: { automatic_yes: 'already written' }, follow_up_source_experience_key: null }),
      givingLedgerRow(),
    ];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp).toBeNull();
    expect(state?.status === 'pending' && state.draft).toEqual({
      automatic_yes: 'already written',
    });
  });

  it('keeps showing the follow-up when the row records one', async () => {
    world.sessions = [
      row({
        answers: { automatic_yes: 'I did ask, and she said yes' },
        follow_up_source_experience_key: TGL_KEY,
      }),
      givingLedgerRow(),
    ];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp?.depositRequest).toBe(DEPOSIT);
  });

  it('never writes anything while deciding, on either path', async () => {
    world.sessions = [givingLedgerRow()];
    await buildTwoyState(fakeClient(), MEMBER);
    world.sessions = [row({ follow_up_source_experience_key: TGL_KEY }), givingLedgerRow()];
    await buildTwoyState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
  });
});

describe('standalone mode mentions nothing, anywhere she can read', () => {
  /**
   * Every string a member can be shown by this feature when there is no
   * follow-up. If the earlier template leaked into any of them, this is
   * where it would show up.
   */
  function everyMemberFacingString(): string[] {
    const offer = buildTwoyExperiment();
    return [
      ...Object.values(TWOY_COPY),
      ...TWOY_INTRO_BODY_LINES,
      ...TWOY_SECTIONS.map((section) => section.title),
      ...TWOY_QUESTIONS.map((question) => promptFor(question, null)),
      TWOY_CLOSING_LINE,
      TWOY_CLOSING_LABEL,
      TWOY_RESOURCE.title,
      TWOY_RESOURCE.label,
      TWOY_RESOURCE.body,
      TWOY_RESOURCE.full,
      TWOY_EXPERIMENT_ACTION,
      TWOY_EXPERIMENT_DAILY_QUESTION,
      offer.title,
      offer.action,
      offer.hardDay,
      offer.protocol,
    ];
  }

  it('names the earlier experience in none of them', () => {
    for (const line of everyMemberFacingString()) {
      expect(line, `leaks the earlier template: ${line}`).not.toMatch(/giving ledger/i);
      expect(line).not.toMatch(/the-giving-ledger/i);
    }
  });

  it('does not gesture at it either, with a ledger, a deposit or a callback', () => {
    for (const line of everyMemberFacingString()) {
      expect(line, `gestures at the earlier template: ${line}`).not.toMatch(/\bledger\b/i);
      expect(line).not.toMatch(/\bdeposit\b/i);
      // The follow-up wording opens "Last time, you told Root". The
      // standalone question one legitimately contains "the last time you
      // said yes", which is about her own week and not about this app, so
      // the phrase matched here is the callback itself.
      expect(line).not.toMatch(/last time, you told Root/i);
      expect(line).not.toMatch(/\bwhen you last sat down\b/i);
    }
  });

  it('leaves no empty slot, stray colon or half built sentence in question one', () => {
    const prompt = promptFor(TWOY_QUESTIONS[0]!, null);
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
    expect(prompt).not.toMatch(/:\s*$/);
    expect(prompt).not.toMatch(/:\s*\./);
    expect(prompt.trim()).toBe(prompt);
  });

  it('no member-facing component of this feature can even name it', () => {
    // The screens are handed her own words and nothing else, so this is a
    // property of the wiring rather than of the copy: the name is not in
    // these files at all.
    const MEMBER_FACING = [
      'components/the-weight-of-yes/TheWeightOfYesExperience.tsx',
      'components/the-weight-of-yes/TheWeightOfYesEntry.tsx',
      'components/the-weight-of-yes/TheWeightOfYesResource.tsx',
      'components/the-weight-of-yes/TheWeightOfYesExperimentPanel.tsx',
      'app/the-weight-of-yes/page.tsx',
      'lib/the-weight-of-yes/copy.ts',
      'lib/the-weight-of-yes/questions.ts',
      'lib/the-weight-of-yes/experiment.ts',
    ];
    for (const file of MEMBER_FACING) {
      // Prose stripped out first. These files EXPLAIN the follow-up rule,
      // in comments, using the earlier template's name, which is exactly
      // where that name belongs. What must not carry it is anything that
      // can reach a screen.
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // copy.ts holds the coach's own band heading, and that is the one
      // permitted mention in this list. Everything a MEMBER is shown comes
      // out of TWOY_COPY and the constants beside it, which the string
      // assertions above cover.
      const memberHalf =
        file === 'lib/the-weight-of-yes/copy.ts'
          ? source.slice(0, source.indexOf('export const TWOY_COACH_COPY'))
          : source;
      expect(memberHalf, `${file} names the earlier template`).not.toMatch(/Giving Ledger/);
      expect(memberHalf).not.toMatch(/the-giving-ledger/);
    }
  });

  it('and the pop-up she is knocked with says nothing about it either', () => {
    expect(TWOY_COPY.popupBody).not.toMatch(/giving ledger/i);
    expect(TWOY_COPY.popupBody).not.toMatch(/\blast time\b/i);
    expect(TWOY_COPY.cardBody).not.toMatch(/giving ledger/i);
  });
});

describe('the flag records what ran', () => {
  it('is written on the insert, and only on the insert', () => {
    const data = read('lib/the-weight-of-yes/data.ts');
    expect(data).toContain('follow_up_source_experience_key: params.followUpSourceExperienceKey');
    // The update branch carries answers and a timestamp, and nothing else.
    const update = data.slice(data.indexOf('if (existing) {'), data.indexOf('const { data, error } = await supabase\n    .from(HAPPINESS_DEEP_DIVE_TABLE)\n    .insert('));
    expect(update).not.toContain('follow_up_source_experience_key');
  });

  it('is resolved on the server, never taken from the client', () => {
    const action = read('app/actions/theWeightOfYes.ts');
    expect(action).toContain('await resolveTwoyFollowUp(supabase, user.id)');
    // The save action takes exactly one argument, the draft, so there is no
    // channel for a hand-built request to claim a follow-up.
    expect(action).toContain('export async function saveTheWeightOfYesDraftAction(\n  draft: unknown\n)');
  });

  it('the completion never revisits it', () => {
    const data = read('lib/the-weight-of-yes/data.ts');
    const completing = data.slice(data.indexOf('export async function completeTwoySession'));
    const updateCall = completing.slice(completing.indexOf('.update({'), completing.indexOf('.eq(\'id\''));
    expect(updateCall).toContain('kind_no');
    expect(updateCall).not.toContain('follow_up_source_experience_key');
  });

  it('the migration says what a null means, so nobody has to guess', () => {
    const migration = readFileSync(
      path.resolve(APP_ROOT, '../../supabase/migrations/00000000000214_the_weight_of_yes.sql'),
      'utf8'
    );
    expect(migration).toContain('follow_up_source_experience_key');
    expect(migration).toContain('Null means the standalone version ran');
  });
});

describe('the coach sees both answers', () => {
  it('picks the deposit that was standing when she wrote this sitting', () => {
    const sittings = [
      { completedAt: '2026-09-05T10:00:00.000Z', depositRequest: 'the newer one' },
      { completedAt: '2026-09-01T10:00:00.000Z', depositRequest: 'the older one' },
    ];
    // A sitting written on the 3rd saw the older deposit.
    expect(depositForSitting(sittings, '2026-09-03T10:00:00.000Z')).toBe('the older one');
    // One written on the 6th saw the newer one.
    expect(depositForSitting(sittings, '2026-09-06T10:00:00.000Z')).toBe('the newer one');
    // An unfinished one is looking at what stands right now.
    expect(depositForSitting(sittings, null)).toBe('the newer one');
  });

  it('ignores an unfinished or empty earlier sitting entirely', () => {
    expect(depositForSitting([{ completedAt: null, depositRequest: 'draft' }], null)).toBeNull();
    expect(
      depositForSitting([{ completedAt: '2026-09-01T00:00:00.000Z', depositRequest: '  ' }], null)
    ).toBeNull();
    expect(depositForSitting([], null)).toBeNull();
  });

  it('the band is at the top of the card, names the earlier template, and shows both sides', () => {
    const full = read('app/coach/clients/[id]/TheWeightOfYesPanel.tsx');
    const panel = full.slice(full.indexOf('export function TheWeightOfYesPanel'));
    const bandAt = panel.indexOf('TWOY_COACH_COPY.followUpHeading');
    const openerAt = panel.indexOf('TWOY_COACH_COPY.openerHeading');
    const answersAt = panel.indexOf('TWOY_COACH_COPY.answersHeading');
    expect(bandAt).toBeGreaterThan(-1);
    expect(openerAt).toBeGreaterThan(bandAt);
    expect(answersAt).toBeGreaterThan(openerAt);
    expect(TWOY_COACH_COPY.followUpHeading).toBe('Follow-up from The Giving Ledger');
    expect(panel).toContain('selected.followUpSourceAnswer');
    expect(panel).toContain('selected.answers[TWOY_FOLLOW_UP_KEY]');
  });

  it('shows the band only when this sitting actually ran as one', () => {
    const panel = read('app/coach/clients/[id]/TheWeightOfYesPanel.tsx');
    expect(panel).toContain('{selected.followUpSourceExperienceKey ? (');
    // And a standalone sitting says so rather than showing nothing, so a
    // coach never has to guess whether the follow-up failed.
    expect(panel).toContain('TWOY_COACH_COPY.standaloneNote');
  });

  it('costs no extra read for a client whose sittings all ran standalone', () => {
    const action = read('app/actions/theWeightOfYes.ts');
    expect(action).toContain('const anyFollowUp = sessionRead.records.some(');
    expect(action).toContain('const sourceSittings = anyFollowUp');
  });

  it('renders question one under the wording she was actually shown', () => {
    const panel = read('app/coach/clients/[id]/TheWeightOfYesPanel.tsx');
    expect(panel).toContain('promptForSitting(selected, question.key)');
    expect(panel).toContain('followUpPromptFor(session.followUpSourceAnswer)');
  });
});
