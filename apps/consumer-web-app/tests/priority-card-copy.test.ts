/**
 * Priority Card — copy, analytics vocabulary, and wiring guards.
 *
 * A source scan rather than a rendered-component test, for the same reason
 * tests/product-analytics-payload-safety.test.ts and
 * tests/coach-lock-ui-guard.test.ts are: server actions cannot be invoked
 * under vitest here (next/headers), and SSR component tests do not render
 * in this repo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PRIORITY_BUTTON_LABELS,
  PRIORITY_CARD_LABEL,
  PRIORITY_DONE_TEXT,
  PRIORITY_HELP_HEADING,
  PRIORITY_SAVED_TEXT,
  RE_ENTRY_HELP_TEXT,
  RE_ENTRY_PRIORITY_TEXT,
} from '@/lib/priority/copy';
import { PRIORITY_ACTIONS, PRIORITY_RULES, isPriorityAction, isPriorityRule } from '@/lib/analytics/surfaces';
import { PRIORITY_LADDER, type PriorityRule } from '@/lib/priority/types';

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');

function read(relative: string): string {
  return readFileSync(path.join(APP_ROOT, relative), 'utf8');
}

const ALL_MEMBER_FACING_COPY = [
  PRIORITY_CARD_LABEL,
  PRIORITY_DONE_TEXT,
  PRIORITY_SAVED_TEXT,
  PRIORITY_HELP_HEADING,
  RE_ENTRY_PRIORITY_TEXT,
  RE_ENTRY_HELP_TEXT,
  ...Object.values(PRIORITY_BUTTON_LABELS),
];

describe('the card says what the brief specifies', () => {
  it('labels itself "Your priority today"', () => {
    expect(PRIORITY_CARD_LABEL).toBe('Your priority today');
  });

  it('offers exactly the three named buttons', () => {
    expect(PRIORITY_BUTTON_LABELS).toEqual({
      done: 'Done',
      help: 'Help me',
      save: 'Save for later',
    });
  });
});

describe('voice', () => {
  it('contains no em dash anywhere a member can read', () => {
    for (const line of ALL_MEMBER_FACING_COPY) {
      expect(line).not.toContain('—');
    }
  });

  it('never grades, instructs, or invokes guilt', () => {
    const forbidden = [
      'you should',
      'you must',
      'you need to',
      'you failed',
      'missed',
      'streak',
      'overdue',
      'behind',
      'make sure you',
    ];
    for (const line of ALL_MEMBER_FACING_COPY) {
      for (const phrase of forbidden) {
        expect(line.toLowerCase()).not.toContain(phrase);
      }
    }
  });
});

describe('re-entry speaks the Root Presence System own words, not a second welcome', () => {
  it('renders RETURN_GREETING_TEXT as the welcome line rather than a string of its own', () => {
    const service = read('lib/priority/service.ts');
    expect(service).toContain("import { RETURN_GREETING_TEXT }");
    expect(service).toContain('welcomeLine: isReEntry ? RETURN_GREETING_TEXT : null');

    // And the card renders whatever the service supplied, never its own.
    const card = read('components/priority/PriorityCard.tsx');
    expect(card).toContain('{welcomeLine}');
  });

  it('never writes to member_return_greetings, which stays the greeting one owner', () => {
    // The Priority Card only READS the absence classification. Claiming a
    // greeting episode remains lib/coaching-engine/service.ts's job, so the
    // two systems can never both claim the same gap.
    // Checks for a real call or import, not a mention: these files
    // legitimately discuss the greeting owner in their comments, and a
    // guard that fired on prose would push that explanation out of the
    // code rather than protect anything.
    for (const file of [
      'lib/priority/service.ts',
      'lib/priority/data.ts',
      'lib/priority/select.ts',
      'app/actions/priority.ts',
    ]) {
      const source = read(file);
      expect(source).not.toContain("from('member_return_greetings')");
      expect(source).not.toContain('tryMarkReturnGreetingShown(');
      expect(source).not.toMatch(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*return-greeting\/data['"]/);
    }
  });

  it('has exactly one absence-threshold module, so there is no second detector', () => {
    const absence = read('lib/return-greeting/absence.ts');
    expect(absence).toContain('RE_ENTRY_MIN_ABSENCE_DAYS');
    // The re-entry classifier defers to the existing greeting gate rather
    // than restating the 3-day rule.
    expect(absence).toContain('isEligibleForReturnGreeting');

    // And nothing else in lib/priority/ declares a threshold of its own.
    for (const file of ['lib/priority/select.ts', 'lib/priority/service.ts', 'lib/priority/copy.ts']) {
      expect(read(file)).not.toContain('MIN_GAP_DAYS');
      expect(read(file)).not.toMatch(/const\s+\w*ABSENCE\w*\s*=/);
    }
  });
});

describe('analytics vocabulary lines up with the database', () => {
  it('PRIORITY_RULES matches PriorityRule exactly', () => {
    const fromTypes: PriorityRule[] = ['re_entry', ...PRIORITY_LADDER];
    expect([...PRIORITY_RULES].sort()).toEqual([...fromTypes].sort());
  });

  it("matches migration 147's own rule check constraint", () => {
    const migration = readFileSync(
      path.join(REPO_ROOT, 'supabase/migrations/00000000000147_priority_card.sql'),
      'utf8'
    );
    for (const rule of PRIORITY_RULES) {
      expect(migration).toContain(`'${rule}'`);
    }
    for (const eventType of ['priority_shown', 'priority_action', 're_entry_shown']) {
      expect(migration).toContain(`'${eventType}'`);
    }
  });

  it('validates rule and action slugs as a closed set, since they arrive from the browser', () => {
    expect(isPriorityRule('todays_focus')).toBe(true);
    expect(isPriorityRule('something_else')).toBe(false);
    expect(isPriorityRule(42)).toBe(false);

    expect(PRIORITY_ACTIONS).toEqual(['done', 'help', 'save']);
    expect(isPriorityAction('done')).toBe(true);
    expect(isPriorityAction('deleted')).toBe(false);
  });

  it('fires all three required events, and re_entry_shown only on a re-entry', () => {
    const tracker = read('components/priority/TrackPriorityShown.tsx');
    expect(tracker).toContain('trackPriorityShownAction(rule)');
    expect(tracker).toContain('if (isReEntry && shouldFire');

    const actions = read('app/actions/priority.ts');
    expect(actions).toContain("eventType: 'priority_shown'");
    expect(actions).toContain("eventType: 'priority_action'");
    expect(actions).toContain("eventType: 're_entry_shown'");
  });

  it('carries no health content on any priority payload', () => {
    const actions = read('app/actions/priority.ts');
    // The only payload fields used anywhere in this file.
    expect(actions).toContain('payload: { rule }');
    expect(actions).toContain('payload: { rule, action }');
    for (const banned of ['title', 'reason', 'findingSentence', 'driverId', 'priorityKey']) {
      expect(actions).not.toContain(`payload: { ${banned}`);
    }
  });
});

describe('button behavior is real, not decorative', () => {
  it('Done writes the Reset Plan own daily log, which is what feeds tomorrow selection', () => {
    const actions = read('app/actions/priority.ts');
    expect(actions).toContain('upsertResetPlanDailyLog');
    expect(actions).toContain("'completed_normal'");
    expect(actions).toContain("setDailyPriorityStatus(supabase, ctx.memberId, ctx.localDate, 'done')");
  });

  it('Help me expands in place and never navigates away', () => {
    const card = read('components/priority/PriorityCard.tsx');
    expect(card).toContain('setHelpOpen');
    // The help block renders inline inside the same <section>.
    expect(card).toContain('{helpOpen && (');
    // No router push anywhere in the card.
    expect(card).not.toContain('router.push');
    expect(card).not.toContain('useRouter');
  });

  it('Save for later demotes rather than dismissing', () => {
    const actions = read('app/actions/priority.ts');
    expect(actions).toContain("setDailyPriorityStatus(supabase, ctx.memberId, ctx.localDate, 'saved')");

    // The page renders the dominant slot only while the card is not saved,
    // and gives the saved card its own place lower down.
    const page = read('app/today/page.tsx');
    expect(page).toContain("priority.status !== 'saved'");
    expect(page).toContain("priority.status === 'saved'");
    expect(page).toContain('collapsed');
  });
});

describe('entrance animation', () => {
  it('reuses the existing reduced-motion-aware fade-up rather than a second animation', () => {
    const card = read('components/priority/PriorityCard.tsx');
    expect(card).toContain('mef-animate-in');
    // No bounce/overshoot easing in this build.
    expect(card).not.toContain('cubic-bezier(0.34, 1.56');
    expect(card).not.toContain('mef-pop-in');
  });

  it('stages label, then priority, then reason, then buttons', () => {
    const card = read('components/priority/PriorityCard.tsx');
    const stageBlock = card.slice(card.indexOf('const STAGE_MS'), card.indexOf('function stage'));
    const label = Number(stageBlock.match(/label:\s*(\d+)/)?.[1]);
    const priority = Number(stageBlock.match(/priority:\s*(\d+)/)?.[1]);
    const reason = Number(stageBlock.match(/reason:\s*(\d+)/)?.[1]);
    const buttons = Number(stageBlock.match(/buttons:\s*(\d+)/)?.[1]);

    expect(label).toBeLessThan(priority);
    expect(priority).toBeLessThan(reason);
    expect(reason).toBeLessThan(buttons);
  });

  it('and .mef-animate-in really is disabled under prefers-reduced-motion', () => {
    const css = read('app/globals.css');
    const reducedBlocks = css.split('@media (prefers-reduced-motion: reduce)');
    const disablesAnimateIn = reducedBlocks
      .slice(1)
      .some((block) => block.slice(0, 200).includes('.mef-animate-in'));
    expect(disablesAnimateIn).toBe(true);
  });
});

describe('the card is the dominant first element and there is never more than one', () => {
  it('renders above every other card on Today, including the first-check-in welcome', () => {
    const page = read('app/today/page.tsx');
    const cardIndex = page.indexOf('<PriorityCard view={priority} />');
    const welcomeIndex = page.indexOf('<FirstCheckInWelcome />');
    const zonesIndex = page.indexOf('<TodayZones');

    expect(cardIndex).toBeGreaterThan(-1);
    expect(cardIndex).toBeLessThan(welcomeIndex);
    expect(cardIndex).toBeLessThan(zonesIndex);
  });

  it('is not a modal or a popup', () => {
    const card = read('components/priority/PriorityCard.tsx');
    expect(card).not.toContain('role="dialog"');
    expect(card).not.toContain('fixed inset-0');
    expect(card).not.toContain('createPortal');
  });
});
