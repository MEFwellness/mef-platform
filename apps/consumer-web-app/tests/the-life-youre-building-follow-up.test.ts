/**
 * The follow-up, used a second time: The Life You're Building following on
 * from Owning Your Value.
 *
 * FIVE THINGS ARE PROVED HERE, and the third is the one that matters most.
 *
 * 1. BOTH MODES OF QUESTION NINE. A member with a completed Owning Your
 *    Value sitting gets the follow-up wording with her own held sentence
 *    quoted verbatim, and one extra line on her intro. A member without one
 *    gets the standalone wording and the standard intro. Nothing else about
 *    the nine questions changes in either direction.
 *
 * 2. WHEN THE CHECK HAPPENS. Delivery time, not assignment time: an Owning
 *    Your Value finished after the assignment landed but before she opened
 *    this one still counts. Once her sitting starts, the STORED flag
 *    decides, so nothing rewrites a sitting she is already inside.
 *
 * 3. STANDALONE MODE MENTIONS NOTHING. A member who never did the earlier
 *    template must find zero evidence anywhere that it exists. This is
 *    asserted twice over: against every member-facing STRING this feature
 *    can produce in standalone mode, and against the SOURCE of every
 *    member-facing file, which cannot name it because it never imports it.
 *
 * 4. THE FLAG RECORDS WHAT RAN. It is written on the insert, from the
 *    server's own read, and never from anything the client posts. Question
 *    nine's answer is stored in its own column in BOTH modes.
 *
 * 5. THE CLOSING AND THE COACH SEE BOTH SENTENCES. Then and Now, in that
 *    order, under the follow-up fixed line, and the coach's band names the
 *    earlier template and pairs the sentence that was standing when she
 *    wrote this sitting with what she wrote back to it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildTlybState } from '@/lib/the-life-youre-building/service';
import { TLYB_KEY } from '@/lib/the-life-youre-building/constants';
import { OYV_KEY } from '@/lib/owning-your-value/constants';
import { OYV_QUESTIONS } from '@/lib/owning-your-value/questions';
import {
  TLYB_FOLLOW_UP_KEY,
  TLYB_QUESTIONS,
  TLYB_SENTENCE_KEY,
  tlybPromptFor,
} from '@/lib/the-life-youre-building/questions';
import {
  TLYB_CLOSING_FOLLOW_UP_LINE,
  TLYB_CLOSING_NOW_LABEL,
  TLYB_CLOSING_STANDALONE_LINE,
  TLYB_CLOSING_THEN_LABEL,
  TLYB_COACH_COPY,
  TLYB_COPY,
  TLYB_INTRO_BODY_LINES,
  TLYB_INTRO_FOLLOW_UP_LINE,
  TLYB_RESOURCE,
  TLYB_SECTIONS,
  TLYB_SLIDER_COPY,
} from '@/lib/the-life-youre-building/copy';
import {
  TLYB_EXPERIMENT_ACTION,
  TLYB_EXPERIMENT_DAILY_QUESTION,
  buildTlybExperiment,
} from '@/lib/the-life-youre-building/experiment';
import { heldSentenceForSitting } from '@/lib/the-life-youre-building/followUp';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MEMBER = '99999999-9999-4999-8999-999999999999';

const HELD = 'I am allowed to want the thing I want, out loud, without apologising for it';

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
    experience_key: TLYB_KEY,
    questions_version: 1,
    answers: {},
    first_stone: null,
    forward_sentence: null,
    slider_positions: null,
    held_sentence: null,
    follow_up_source_experience_key: null,
    started_at: '2026-09-07T10:00:00.000Z',
    completed_at: null,
    created_at: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

/** A full Owning Your Value answer sheet, so its own reader accepts it. */
function oyvAnswers(held: string): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of OYV_QUESTIONS) answers[question.key] = `oyv ${question.key}`;
  answers.held_sentence = held;
  return answers;
}

function owningYourValueRow(overrides: Record<string, unknown> = {}) {
  return row({
    id: 'oyv-1',
    assignment_id: 'assignment-oyv',
    experience_key: OYV_KEY,
    answers: oyvAnswers(HELD),
    held_sentence: HELD,
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

describe('question nine, in both of its modes', () => {
  it('runs as a follow-up when a completed earlier sitting exists, quoting her verbatim', async () => {
    world.sessions = [owningYourValueRow()];
    const state = await buildTlybState(fakeClient(), MEMBER);

    expect(state?.status).toBe('pending');
    const followUp = state?.status === 'pending' ? state.followUp : null;
    expect(followUp).toEqual({ sourceExperienceKey: OYV_KEY, heldSentence: HELD });

    const prompt = tlybPromptFor(TLYB_QUESTIONS[8]!, followUp);
    expect(prompt).toBe(
      `You once asked Root to hold onto this: ${HELD}. Read it now, from where you are standing today. What do you want to say back to it?`
    );
    // Her words are inside it exactly as she wrote them.
    expect(prompt).toContain(HELD);
  });

  it('runs standalone when there is no completed earlier sitting', async () => {
    world.sessions = [];
    const state = await buildTlybState(fakeClient(), MEMBER);
    const followUp = state?.status === 'pending' ? state.followUp : null;
    expect(followUp).toBeNull();
    expect(tlybPromptFor(TLYB_QUESTIONS[8]!, followUp)).toBe(
      'Write the sentence you would want Root to hold onto from today. The one that tells the truth about who you are becoming.'
    );
  });

  it('runs standalone when the earlier sitting is only a draft', async () => {
    // An unfinished earlier sitting is not a completed one, and quoting a
    // draft answer back at her would be quoting something she never
    // finished saying.
    world.sessions = [owningYourValueRow({ completed_at: null })];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp).toBeNull();
  });

  it('runs standalone when the earlier sitting left the sentence empty', async () => {
    world.sessions = [
      owningYourValueRow({ held_sentence: '   ', answers: oyvAnswers('   ') }),
    ];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp).toBeNull();
  });

  it("reads the earlier sitting's answer sheet when its own column is empty", async () => {
    // Covers a sitting finished before that column existed.
    world.sessions = [owningYourValueRow({ held_sentence: null })];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp?.heldSentence).toBe(HELD);
  });

  it('changes question nine and nothing else', async () => {
    world.sessions = [owningYourValueRow()];
    const state = await buildTlybState(fakeClient(), MEMBER);
    const followUp = state?.status === 'pending' ? state.followUp : null;

    for (const question of TLYB_QUESTIONS.slice(0, 8)) {
      expect(tlybPromptFor(question, followUp)).toBe(question.prompt);
    }
    // And the adapting question is the last one, by key, not by position in
    // some other list.
    expect(TLYB_QUESTIONS[8]?.key).toBe(TLYB_FOLLOW_UP_KEY);
  });

  it('the intro carries the extra line in follow-up mode and not otherwise', () => {
    const experience = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    expect(experience).toContain(
      'followUp\n        ? [...TLYB_INTRO_BODY_LINES, TLYB_INTRO_FOLLOW_UP_LINE]\n        : [...TLYB_INTRO_BODY_LINES]'
    );
    // Two intros, two storage keys, so a member sent this a second time as
    // a follow-up watches the new line arrive.
    expect(experience).toContain("'the-life-youre-building-intro-follow-up'");
    expect(experience).toContain("'the-life-youre-building-intro'");
  });
});

describe('when the check happens', () => {
  it('is delivery time: an earlier sitting finished AFTER the assignment still counts', async () => {
    // The assignment landed on the 6th. The earlier sitting was finished on
    // the 7th, a day later. She opens this one after that, and the
    // follow-up runs.
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [owningYourValueRow({ completed_at: '2026-09-07T09:00:00.000Z' })];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp?.heldSentence).toBe(HELD);
  });

  it('is settled by the stored flag once her sitting exists', async () => {
    // She started before the earlier sitting was finished, so her row
    // records a standalone sitting. Finishing that earlier template
    // mid-sitting must NOT rewrite the question she is inside.
    world.sessions = [
      row({ answers: { ordinary_day: 'already written' }, follow_up_source_experience_key: null }),
      owningYourValueRow(),
    ];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp).toBeNull();
    expect(state?.status === 'pending' && state.draft).toEqual({
      ordinary_day: 'already written',
    });
  });

  it('keeps showing the follow-up when the row records one', async () => {
    world.sessions = [
      row({
        answers: { ordinary_day: 'already written' },
        follow_up_source_experience_key: OYV_KEY,
      }),
      owningYourValueRow(),
    ];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp?.heldSentence).toBe(HELD);
  });

  it('never writes anything while deciding, on either path', async () => {
    world.sessions = [owningYourValueRow()];
    await buildTlybState(fakeClient(), MEMBER);
    world.sessions = [row({ follow_up_source_experience_key: OYV_KEY }), owningYourValueRow()];
    await buildTlybState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
  });

  it('reads the earlier template through its own scoped accessor', async () => {
    world.sessions = [owningYourValueRow()];
    await buildTlybState(fakeClient(), MEMBER);
    expect(sessionFilters).toContainEqual(['experience_key', TLYB_KEY]);
    expect(sessionFilters).toContainEqual(['experience_key', OYV_KEY]);
  });
});

describe('standalone mode mentions nothing, anywhere she can read', () => {
  /**
   * Every string a member can be shown by this feature when there is no
   * follow-up. If the earlier template leaked into any of them, this is
   * where it would show up.
   */
  function everyMemberFacingString(): string[] {
    const offer = buildTlybExperiment();
    return [
      ...Object.values(TLYB_COPY),
      ...TLYB_INTRO_BODY_LINES,
      ...Object.values(TLYB_SLIDER_COPY),
      ...TLYB_SECTIONS.map((section) => section.title),
      ...TLYB_QUESTIONS.map((question) => tlybPromptFor(question, null)),
      ...TLYB_QUESTIONS.flatMap((question) =>
        question.poles ? [question.poles.near, question.poles.far] : []
      ),
      TLYB_CLOSING_STANDALONE_LINE,
      TLYB_RESOURCE.title,
      TLYB_RESOURCE.label,
      TLYB_RESOURCE.body,
      TLYB_RESOURCE.full,
      TLYB_EXPERIMENT_ACTION,
      TLYB_EXPERIMENT_DAILY_QUESTION,
      offer.title,
      offer.action,
      offer.hardDay,
      offer.protocol,
    ];
  }

  it('names the earlier experience in none of them', () => {
    for (const line of everyMemberFacingString()) {
      expect(line, `leaks the earlier template: ${line}`).not.toMatch(/owning your value/i);
      expect(line).not.toMatch(/owning-your-value/i);
    }
  });

  it('does not gesture at it either, with a callback or a held sentence', () => {
    for (const line of everyMemberFacingString()) {
      // The follow-up wording opens "You once asked Root to hold onto
      // this", and the intro's extra line opens "A while back". The
      // standalone question nine legitimately says "hold onto from today",
      // which is about this sitting, so what is matched here is the
      // callback itself rather than the verb.
      expect(line, `gestures at the earlier template: ${line}`).not.toMatch(
        /you once asked Root/i
      );
      expect(line).not.toMatch(/\ba while back\b/i);
      expect(line).not.toMatch(/\blast time\b/i);
      expect(line).not.toMatch(/\bwhen you last sat down\b/i);
      expect(line).not.toMatch(/\bearlier sitting\b/i);
    }
    // And the two strings that DO carry the follow-up are not in that set.
    const standalone = everyMemberFacingString();
    expect(standalone).not.toContain(TLYB_INTRO_FOLLOW_UP_LINE);
    expect(standalone).not.toContain(TLYB_CLOSING_FOLLOW_UP_LINE);
  });

  it('leaves no empty slot, stray colon or half built sentence in question nine', () => {
    const prompt = tlybPromptFor(TLYB_QUESTIONS[8]!, null);
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
    expect(prompt).not.toMatch(/:\s*$/);
    expect(prompt).not.toMatch(/:\s*\./);
    expect(prompt.trim()).toBe(prompt);
  });

  it('no member-facing file of this feature can even name it', () => {
    // The screens are handed her own words and nothing else, so this is a
    // property of the wiring rather than of the copy: the name is not in
    // these files at all, and neither is an import of that template.
    const MEMBER_FACING = [
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx',
      'components/the-life-youre-building/TheLifeYoureBuildingEntry.tsx',
      'components/the-life-youre-building/TheLifeYoureBuildingResource.tsx',
      'components/the-life-youre-building/TheLifeYoureBuildingExperimentPanel.tsx',
      'app/the-life-youre-building/page.tsx',
      'lib/the-life-youre-building/copy.ts',
      'lib/the-life-youre-building/questions.ts',
      'lib/the-life-youre-building/sliders.ts',
      'lib/the-life-youre-building/experiment.ts',
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
      // out of TLYB_COPY and the constants beside it, which the string
      // assertions above cover.
      const memberHalf =
        file === 'lib/the-life-youre-building/copy.ts'
          ? source.slice(0, source.indexOf('export const TLYB_COACH_COPY'))
          : source;
      expect(memberHalf, `${file} names the earlier template`).not.toMatch(/Owning Your Value/);
      expect(memberHalf, `${file} imports the earlier template`).not.toMatch(
        /owning-your-value/
      );
    }
  });

  it('and the pop-up and the Home card say nothing about it either', () => {
    expect(TLYB_COPY.popupBody).not.toMatch(/owning your value/i);
    expect(TLYB_COPY.popupBody).not.toMatch(/\blast time\b/i);
    expect(TLYB_COPY.cardBody).not.toMatch(/owning your value/i);
    expect(TLYB_COPY.cardBody).not.toMatch(/\ba while back\b/i);
  });

  it('the standalone closing prints one sentence, under the standalone line', () => {
    const source = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    const closing = source.slice(source.indexOf('function TheClosing'));
    // One entry when there is no "then", two when there is.
    expect(closing).toContain('[{ text: now }]');
    expect(closing).toContain(
      'fixedLine={then ? TLYB_CLOSING_FOLLOW_UP_LINE : TLYB_CLOSING_STANDALONE_LINE}'
    );
  });
});

describe('the flag records what ran, and the sentence is stored either way', () => {
  it('is written on the insert, and only on the insert', () => {
    const data = read('lib/the-life-youre-building/data.ts');
    expect(data).toContain(
      'follow_up_source_experience_key: params.followUpSourceExperienceKey'
    );
    // The update branch of the draft save carries answers, marks and a
    // timestamp, and nothing else.
    const save = data.slice(
      data.indexOf('export async function saveTlybDraft'),
      data.indexOf('export async function completeTlybSession')
    );
    const updateBranch = save.slice(save.indexOf('if (existing) {'), save.indexOf('const { data, error } = await supabase\n    .from(HAPPINESS_DEEP_DIVE_TABLE)\n    .insert('));
    expect(updateBranch).not.toContain('follow_up_source_experience_key');
  });

  it('is resolved on the server, never taken from the client', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    expect(action).toContain('await resolveTlybFollowUp(supabase, user.id)');
    // The save action takes exactly two arguments, the draft and the marks,
    // so there is no channel for a hand-built request to claim a follow-up.
    expect(action).toContain(
      'export async function saveTheLifeYoureBuildingDraftAction(\n  draft: unknown,\n  sliders: unknown\n)'
    );
  });

  it('the completion never revisits it', () => {
    const data = read('lib/the-life-youre-building/data.ts');
    const completing = data.slice(data.indexOf('export async function completeTlybSession'));
    const updateCall = completing.slice(
      completing.indexOf('.update({'),
      completing.indexOf(".eq('id'")
    );
    expect(updateCall).toContain('first_stone');
    expect(updateCall).toContain('forward_sentence');
    expect(updateCall).not.toContain('follow_up_source_experience_key');
  });

  it('question nine is stored in its own column whichever mode ran', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    // One unconditional read of her answer, with no branch on the mode
    // anywhere near it.
    expect(action).toContain("const forwardSentence = (clean[TLYB_SENTENCE_KEY] ?? '').trim()");
    expect(TLYB_SENTENCE_KEY).toBe('the_sentence_forward');
  });

  it('the migration says what a null means, so nobody has to guess', () => {
    const migration = readFileSync(
      path.resolve(
        APP_ROOT,
        '../../supabase/migrations/00000000000219_the_life_youre_building.sql'
      ),
      'utf8'
    );
    expect(migration).toContain('follow_up_source_experience_key');
    expect(migration).toContain('Null means the standalone version');
    expect(migration).toContain('stored in both the standalone and the follow-up mode');
  });
});

describe('the closing and the coach see both sentences', () => {
  it('picks the sentence that was standing when she wrote this sitting', () => {
    const sittings = [
      { completedAt: '2026-09-05T10:00:00.000Z', heldSentence: 'the newer one' },
      { completedAt: '2026-09-01T10:00:00.000Z', heldSentence: 'the older one' },
    ];
    // A sitting written on the 3rd saw the older sentence.
    expect(heldSentenceForSitting(sittings, '2026-09-03T10:00:00.000Z')).toBe('the older one');
    // One written on the 6th saw the newer one.
    expect(heldSentenceForSitting(sittings, '2026-09-06T10:00:00.000Z')).toBe('the newer one');
    // An unfinished one is looking at what stands right now.
    expect(heldSentenceForSitting(sittings, null)).toBe('the newer one');
  });

  it('ignores an unfinished or empty earlier sitting entirely', () => {
    expect(heldSentenceForSitting([{ completedAt: null, heldSentence: 'draft' }], null)).toBeNull();
    expect(
      heldSentenceForSitting([{ completedAt: '2026-09-01T00:00:00.000Z', heldSentence: '  ' }], null)
    ).toBeNull();
    expect(heldSentenceForSitting([], null)).toBeNull();
  });

  it('the closing prints Then, then Now, under the follow-up fixed line', () => {
    const source = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    const closing = source.slice(source.indexOf('function TheClosing'));
    const thenAt = closing.indexOf('TLYB_CLOSING_THEN_LABEL');
    const nowAt = closing.indexOf('TLYB_CLOSING_NOW_LABEL');
    expect(thenAt).toBeGreaterThan(-1);
    expect(nowAt).toBeGreaterThan(thenAt);
    expect(TLYB_CLOSING_THEN_LABEL).toBe('Then');
    expect(TLYB_CLOSING_NOW_LABEL).toBe('Now');
    expect(TLYB_CLOSING_FOLLOW_UP_LINE).toBe(
      'You wrote the first one too. Look how far the writer has come.'
    );
  });

  it('the band is on the card, names the earlier template, and shows both sides', () => {
    const full = read('app/coach/clients/[id]/TheLifeYoureBuildingPanel.tsx');
    const panel = full.slice(full.indexOf('export function TheLifeYoureBuildingPanel'));
    const positionsAt = panel.indexOf('<ThePositions');
    const stoneAt = panel.indexOf('<TheFirstStone');
    const bandAt = panel.indexOf('TLYB_COACH_COPY.followUpHeading');
    const answersAt = panel.indexOf('TLYB_COACH_COPY.answersHeading');
    expect(positionsAt).toBeGreaterThan(-1);
    expect(stoneAt).toBeGreaterThan(positionsAt);
    expect(bandAt).toBeGreaterThan(stoneAt);
    expect(answersAt).toBeGreaterThan(bandAt);
    expect(TLYB_COACH_COPY.followUpHeading).toBe('Follow-up from Owning Your Value');
    expect(panel).toContain('selected.followUpSourceAnswer');
    expect(panel).toContain('selected.answers[TLYB_FOLLOW_UP_KEY]');
  });

  it('shows the band only when this sitting actually ran as one', () => {
    const panel = read('app/coach/clients/[id]/TheLifeYoureBuildingPanel.tsx');
    expect(panel).toContain('{selected.followUpSourceExperienceKey ? (');
    // And a standalone sitting says so rather than showing nothing, so a
    // coach never has to guess whether the follow-up failed.
    expect(panel).toContain('TLYB_COACH_COPY.standaloneNote');
  });

  it('costs no extra read for a client whose sittings all ran standalone', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    expect(action).toContain('const anyFollowUp = sessionRead.records.some(');
    expect(action).toContain('const sourceSittings = anyFollowUp');
  });

  it('renders question nine under the wording she was actually shown', () => {
    const panel = read('app/coach/clients/[id]/TheLifeYoureBuildingPanel.tsx');
    expect(panel).toContain('promptForSitting(selected, question.key)');
    expect(panel).toContain('followUpPromptFor(session.followUpSourceAnswer)');
  });
});
