/**
 * Priority Card, Part 2 — the motion pass.
 *
 * What is actually at risk in a motion build is not whether a class name
 * is spelled right; it is whether the motion tells the truth. So the bulk
 * of this file is the "Building on yesterday..." trigger, which is the
 * one animation here that makes a claim about the member: that she
 * finished something yesterday and that Root changed course because of
 * it. A trigger that is too loose turns that into a lie she cannot check.
 *
 * The rest guards the properties the brief made non-negotiable and which
 * a future edit could silently break: identical motion in all three
 * surfaces, reduced motion skipping sequences outright rather than
 * shortening them, no bare millisecond literals scattered per animation,
 * and no behavior riding along in a hook that is supposed to hold none.
 *
 * Source scans plus pure-function tests, for the reason
 * tests/priority-card-delivery.test.ts already documents: server actions
 * cannot be invoked under vitest here (next/headers), and SSR component
 * tests do not render in this repo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPriorityBridge,
  isSamePriority,
  previousLocalDate,
} from '@/lib/priority/transition';
import {
  PRIORITY_BRIDGE_AT_MS,
  PRIORITY_ENTRANCE_TOTAL_MS,
  PRIORITY_RECEDE_MS,
  PRIORITY_REVEAL_INDEX,
  priorityBridgeSeenKey,
} from '@/lib/priority/motion';
import { MOTION_DURATION_MS, MOTION_STAGGER_STEP_TIGHT_MS } from '@/lib/motion/tokens';
import { revealStep, revealStepTotalMs } from '@/lib/motion/revealStep';
import { PRIORITY_BRIDGE_TEXT, PRIORITY_BRIDGE_YESTERDAY_LABEL } from '@/lib/priority/copy';
import type { DailyPriorityRecord, SelectedPriority } from '@/lib/priority/types';

const APP_ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return readFileSync(path.join(APP_ROOT, relative), 'utf8');
}

/**
 * The same file with every comment removed.
 *
 * These files explain their own motion at length, so a scan for "no bare
 * millisecond anywhere" matches the prose describing the tokens and not
 * the code. Documenting a duration is the opposite of the problem being
 * guarded against, so the scans that care about real code read this.
 */
function readCode(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const TODAY = '2026-08-12';
const YESTERDAY = '2026-08-11';

function yesterdayRow(overrides: Partial<DailyPriorityRecord> = {}): DailyPriorityRecord {
  return {
    id: 'row-1',
    localDate: YESTERDAY,
    rule: 'reset_plan_commitment',
    priorityKey: 'plan-1',
    title: 'Walk for ten minutes after lunch.',
    help: 'Two minutes counts.',
    href: null,
    status: 'done',
    doneAt: '2026-08-11T18:00:00.000Z',
    savedAt: null,
    ...overrides,
  };
}

function todayPriority(overrides: Partial<SelectedPriority> = {}): SelectedPriority {
  return {
    rule: 'implicated_driver',
    priorityKey: 'driver-9',
    title: 'Keep an eye on bedtime consistency today.',
    reason: null,
    help: 'Just notice it.',
    href: null,
    ...overrides,
  };
}

// =====================================================================
// The trigger. Three conditions, all required.
// =====================================================================

describe('"Building on yesterday..." runs only when Root genuinely adapted', () => {
  it('runs when she completed yesterday\'s priority and today\'s is different', () => {
    const bridge = buildPriorityBridge(yesterdayRow(), todayPriority(), TODAY);
    expect(bridge).toEqual({ yesterdayTitle: 'Walk for ten minutes after lunch.' });
  });

  it('does not run when yesterday was left active', () => {
    expect(buildPriorityBridge(yesterdayRow({ status: 'active' }), todayPriority(), TODAY)).toBeNull();
  });

  it('does not run when yesterday was only saved for later', () => {
    // Saved is not completed. Replaying it would read as Root reminding
    // her what she did not do.
    expect(buildPriorityBridge(yesterdayRow({ status: 'saved' }), todayPriority(), TODAY)).toBeNull();
  });

  it("does not run when today's priority is the same one", () => {
    const same = todayPriority({ rule: 'reset_plan_commitment', priorityKey: 'plan-1' });
    expect(buildPriorityBridge(yesterdayRow(), same, TODAY)).toBeNull();
  });

  it('does not run when there is no row for yesterday at all', () => {
    expect(buildPriorityBridge(null, todayPriority(), TODAY)).toBeNull();
  });

  it('does not call an older row "yesterday"', () => {
    // The single most damaging failure mode: bridging from something she
    // completed days ago while the copy says yesterday.
    const threeDaysAgo = yesterdayRow({ localDate: '2026-08-09' });
    expect(buildPriorityBridge(threeDaysAgo, todayPriority(), TODAY)).toBeNull();
  });

  it('handles a month boundary, so the last day of a month still bridges', () => {
    expect(previousLocalDate('2026-08-01')).toBe('2026-07-31');
    const julyRow = yesterdayRow({ localDate: '2026-07-31' });
    expect(buildPriorityBridge(julyRow, todayPriority(), '2026-08-01')).not.toBeNull();
  });

  it('shows yesterday\'s priority exactly as she was shown it', () => {
    const row = yesterdayRow({ title: 'Take a few minutes for your Daily Reset.' });
    expect(buildPriorityBridge(row, todayPriority(), TODAY)?.yesterdayTitle).toBe(
      'Take a few minutes for your Daily Reset.'
    );
  });
});

describe('same-priority detection survives the cases that would produce a false bridge', () => {
  it('uses the real identity when both sides have one, not the wording', () => {
    // The stored row keeps yesterday's wording; a reworded action library
    // entry must not make today look like a different priority.
    const reworded = todayPriority({
      rule: 'reset_plan_commitment',
      priorityKey: 'plan-1',
      title: 'Take a ten minute walk after lunch.',
    });
    expect(isSamePriority(yesterdayRow(), reworded)).toBe(true);
    expect(buildPriorityBridge(yesterdayRow(), reworded, TODAY)).toBeNull();
  });

  it('two different plans are different priorities even though both are plans', () => {
    const otherPlan = todayPriority({ rule: 'reset_plan_commitment', priorityKey: 'plan-2' });
    expect(isSamePriority(yesterdayRow(), otherPlan)).toBe(false);
  });

  it('the keyless fallback rules compare by rule and title, so two identical fallback days do not bridge', () => {
    const row = yesterdayRow({ rule: 'daily_reset', priorityKey: null, title: 'Take a few minutes for your Daily Reset.' });
    const sameAgain = todayPriority({ rule: 'daily_reset', priorityKey: null, title: 'Take a few minutes for your Daily Reset.' });
    expect(isSamePriority(row, sameAgain)).toBe(true);
    expect(buildPriorityBridge(row, sameAgain, TODAY)).toBeNull();
  });

  it('a keyless fallback and a keyed priority are never the same thing', () => {
    const keyless = yesterdayRow({ rule: 'daily_reset', priorityKey: null });
    expect(isSamePriority(keyless, todayPriority())).toBe(false);
  });

  it('two different keyless fallbacks do bridge', () => {
    const row = yesterdayRow({ rule: 'daily_reset', priorityKey: null, title: 'Take a few minutes for your Daily Reset.' });
    const gentle = todayPriority({ rule: 'gentle_focus', priorityKey: null, title: 'Today, keep one eye on what brought you here.' });
    expect(buildPriorityBridge(row, gentle, TODAY)).not.toBeNull();
  });
});

describe('the trigger cannot influence which priority won', () => {
  it('the selection engine neither imports nor mentions the bridge', () => {
    const select = read('lib/priority/select.ts');
    expect(select).not.toContain('transition');
    expect(select).not.toContain('bridge');
    expect(select).not.toContain('yesterday');
  });

  it('the service builds the bridge from what she is shown, after selection has run', () => {
    const service = read('lib/priority/service.ts');
    const selectIndex = service.indexOf('const fresh = selectPriority(');
    const bridgeIndex = service.indexOf('buildPriorityBridge(');
    expect(selectIndex).toBeGreaterThan(-1);
    expect(bridgeIndex).toBeGreaterThan(selectIndex);

    // Yesterday's row is never handed to the hierarchy's inputs.
    const inputsBlock = service.slice(
      service.indexOf('const inputs: PriorityInputs'),
      selectIndex
    );
    expect(inputsBlock).not.toContain('yesterday');
  });
});

// =====================================================================
// Reduced motion.
// =====================================================================

describe('reduced motion removes the motion, never the meaning', () => {
  it('skips the bridge sequence outright rather than shortening it', () => {
    const hook = read('components/priority/usePriorityCardMotion.ts');
    // The reduced branch sets the all-at-once phase and returns before any
    // timer is created.
    const effect = hook.slice(hook.indexOf('useLayoutEffect'), hook.indexOf('// ---- Done'));
    const reducedIndex = effect.indexOf("setBridgePhase('all')");
    const firstTimer = effect.indexOf('setTimeout');
    expect(reducedIndex).toBeGreaterThan(-1);
    expect(firstTimer).toBeGreaterThan(reducedIndex);
  });

  it('still renders all three parts of the bridge, as plain sequential text', () => {
    const hook = read('components/priority/usePriorityCardMotion.ts');
    const returned = hook.slice(hook.indexOf('return {\n    reduced'));
    // In the 'all' phase yesterday, the bridge line and today are all on.
    expect(returned).toContain("showsYesterday: bridgePhase !== 'card'");
    expect(returned).toContain("bridgePhase === 'all'");
    expect(returned).toContain("showsToday: bridgePhase === 'card' || bridgePhase === 'all'");
  });

  it('resolves Done and Save for later instantly, with no receding phase to sit through', () => {
    const hook = read('components/priority/usePriorityCardMotion.ts');
    const effect = hook.slice(hook.indexOf('const previousStatus'));
    const reducedIndex = effect.indexOf('if (reduced) {');
    const recedeIndex = effect.indexOf("setResolvePhase('receding')");
    expect(reducedIndex).toBeGreaterThan(-1);
    expect(recedeIndex).toBeGreaterThan(reducedIndex);
  });

  it('reads the setting synchronously before the first paint, so no frame of motion escapes', () => {
    const hook = read('components/priority/usePriorityCardMotion.ts');
    expect(hook).toContain('useLayoutEffect');
    expect(hook).toContain('prefersReducedMotionNow()');
  });

  it('and every new motion class carries its own reduced-motion override', () => {
    const css = read('app/globals.css');
    const blocks = css.split('@media (prefers-reduced-motion: reduce)').slice(1);
    for (const cls of ['.mef-reveal-step', '.mef-expand', '.mef-recede', '.mef-settle-down']) {
      const covered = blocks.some((block) => block.slice(0, 220).includes(`${cls} {`));
      expect(covered, `${cls} has no reduced-motion override`).toBe(true);
    }
  });

  it('uses the one canonical reduced-motion query, never a second matchMedia of its own', () => {
    const files = [
      'components/priority/usePriorityCardMotion.ts',
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
      'components/priority/PriorityBridge.tsx',
    ];
    for (const file of files) {
      const code = readCode(file);
      expect(code).not.toContain('matchMedia');
      expect(code).not.toContain('prefers-reduced-motion');
    }
    // lib/motion/useReducedMotion.ts owns the query string, and both the
    // hook and the synchronous read share that one constant.
    const owner = readCode('lib/motion/useReducedMotion.ts');
    expect(owner.match(/prefers-reduced-motion/g)).toHaveLength(1);
    expect(owner).toContain('matchMedia(QUERY)');
  });
});

// =====================================================================
// One motion language, three surfaces.
// =====================================================================

describe('the pop-up, Home inline and Today inline all move identically', () => {
  it('both presentations drive their motion from the one shared hook', () => {
    for (const file of [
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
    ]) {
      expect(read(file)).toContain('usePriorityCardMotion(view, status');
    }
  });

  it('both render the same bridge component, not their own copy of the sequence', () => {
    for (const file of [
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
    ]) {
      const source = readCode(file);
      expect(source).toContain('<PriorityBridge');
      // The copy lives in one place; neither presentation writes the line.
      expect(source).not.toMatch(/['"`]Building on yesterday/);
      expect(source).not.toContain('PRIORITY_BRIDGE_TEXT');
    }
  });

  it('both stage their entrance in the same order, from the same indexes', () => {
    for (const file of [
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
    ]) {
      const source = read(file);
      const label = source.indexOf('PRIORITY_REVEAL_INDEX.label');
      const priority = source.indexOf('PRIORITY_REVEAL_INDEX.priority');
      const buttons = source.indexOf('PRIORITY_REVEAL_INDEX.buttons');
      expect(label).toBeGreaterThan(-1);
      expect(label).toBeLessThan(priority);
      expect(priority).toBeLessThan(buttons);
    }
  });

  it('Home and Today render the same inline card component', () => {
    for (const file of ['app/dashboard/page.tsx', 'app/today/page.tsx']) {
      expect(read(file)).toContain('<PriorityCard view={priority}');
    }
  });
});

// =====================================================================
// Tokens, not scattered magic numbers.
// =====================================================================

describe('every duration comes from the motion system', () => {
  it('no component in components/priority contains a bare millisecond literal', () => {
    for (const file of [
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
      'components/priority/PriorityBridge.tsx',
      'components/priority/usePriorityCardMotion.ts',
    ]) {
      const source = readCode(file);
      expect(source).not.toMatch(/setTimeout\([^,]+,\s*\d+\s*\)/);
      expect(source).not.toMatch(/animationDelay:\s*[`'"]\d/);
      expect(source).not.toMatch(/\b\d{2,4}ms\b/);
      expect(source).not.toMatch(/duration-\[\d/);
    }
  });

  it('the card\'s own timings are derived from the shared tokens', () => {
    expect(PRIORITY_RECEDE_MS).toBe(MOTION_DURATION_MS.quick);
    // One beat is a Deliberate reveal plus the app's standardized settle.
    expect(PRIORITY_BRIDGE_AT_MS.line).toBeGreaterThan(MOTION_DURATION_MS.deliberate);
    expect(PRIORITY_BRIDGE_AT_MS.handover).toBe(PRIORITY_BRIDGE_AT_MS.line * 2);
    expect(PRIORITY_BRIDGE_AT_MS.today).toBe(
      PRIORITY_BRIDGE_AT_MS.handover + MOTION_DURATION_MS.quick
    );
  });

  it('the bridge beats are strictly ordered, so no step can overtake another', () => {
    const { yesterday, line, handover, today } = PRIORITY_BRIDGE_AT_MS;
    expect(yesterday).toBeLessThan(line);
    expect(line).toBeLessThan(handover);
    expect(handover).toBeLessThan(today);
  });

  it('the whole entrance lands inside the brief\'s 300 to 500ms', () => {
    expect(PRIORITY_ENTRANCE_TOTAL_MS).toBeGreaterThanOrEqual(300);
    expect(PRIORITY_ENTRANCE_TOTAL_MS).toBeLessThanOrEqual(500);
    expect(PRIORITY_ENTRANCE_TOTAL_MS).toBe(
      revealStepTotalMs(4, MOTION_STAGGER_STEP_TIGHT_MS, MOTION_DURATION_MS.standard)
    );
  });

  it('revealStep spaces the four beats evenly and never drops the element\'s own classes', () => {
    expect(revealStep(PRIORITY_REVEAL_INDEX.label).style.animationDelay).toBe('0ms');
    expect(revealStep(PRIORITY_REVEAL_INDEX.buttons).style.animationDelay).toBe(
      `${3 * MOTION_STAGGER_STEP_TIGHT_MS}ms`
    );
    const props = revealStep(1, 'mt-3 text-xl');
    expect(props.className).toBe('mef-reveal-step mt-3 text-xl');
  });

  it('caps the delay tail rather than letting it grow without limit', () => {
    // Bible §6: past the cap the tail reads as a wait, not a rhythm.
    expect(revealStep(50).style.animationDelay).toBe(revealStep(7).style.animationDelay);
  });
});

// =====================================================================
// The motion hook holds no behavior.
// =====================================================================

describe('motion cannot change what the card does', () => {
  it('the motion hook calls no server action and writes no member state', () => {
    const hook = read('components/priority/usePriorityCardMotion.ts');
    expect(hook).not.toContain('@/app/actions/');
    expect(hook).not.toContain('completePriorityAction');
    expect(hook).not.toContain('savePriorityForLaterAction');
    expect(hook).not.toContain('trackPriorityHelpAction');
    expect(hook).not.toContain('useTransition');
  });

  it('the three handlers still come only from the actions hook', () => {
    for (const file of [
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
    ]) {
      const source = read(file);
      expect(source).toContain('usePriorityCardActions(view)');
      expect(source).not.toContain('completePriorityAction');
      expect(source).not.toContain('savePriorityForLaterAction');
    }
  });

  it('the completion haptic fires only when she completed it just now', () => {
    // Found on the live site: the accomplished state also mounts on an
    // ordinary reload, and SuccessCheck's default is to buzz on every
    // mount. Unguarded, that is haptic feedback for something she did
    // hours ago (and a console error, since there is no user gesture).
    const hook = read('components/priority/usePriorityCardMotion.ts');
    const effect = hook.slice(hook.indexOf('const previousStatus'));
    const alreadyResolvedReturn = effect.indexOf("setResolvePhase(status === 'active' ? 'active' : 'resolved')");
    const setsJustResolved = effect.indexOf('setJustResolved(true)');
    expect(alreadyResolvedReturn).toBeGreaterThan(-1);
    // The already-resolved path returns before justResolved is ever set.
    expect(setsJustResolved).toBeGreaterThan(alreadyResolvedReturn);
    // And it starts false, so a card that mounts already done never buzzes.
    expect(hook).toContain('useState(false)');

    for (const file of [
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
    ]) {
      const source = readCode(file);
      expect(source).toContain('haptic={motion.justResolved}');
      // Never the unguarded default.
      expect(source).not.toMatch(/<SuccessCheck(?![\s\S]{0,200}haptic=)/);
    }
  });

  it('the bridge is presentation only and reaches no database of its own', () => {
    const transition = read('lib/priority/transition.ts');
    expect(transition).not.toContain('supabase');
    expect(transition).not.toContain('await');
    expect(transition).not.toContain('async');
  });

  it('the once-per-day replay guard is session state, never a schema change', () => {
    const hook = read('components/priority/usePriorityCardMotion.ts');
    expect(hook).toContain('sessionStorage');
    expect(hook).not.toContain('localStorage');
    expect(priorityBridgeSeenKey('2026-08-12')).toContain('2026-08-12');
    // A different day is a different key, which is what makes tomorrow's
    // adaptation a genuinely new sequence.
    expect(priorityBridgeSeenKey('2026-08-12')).not.toBe(priorityBridgeSeenKey('2026-08-13'));
  });

  it('claims the day only once the sequence has finished, never on mount', () => {
    // Found in a real browser: claiming on mount means any remount before
    // the sequence has played swallows it permanently and silently, since
    // a bridge that never appears is indistinguishable from a day Root
    // did not adapt. React StrictMode reproduces that on every dev mount.
    const hook = read('components/priority/usePriorityCardMotion.ts');
    // From the effect's own call, not the import that also names it.
    const effect = hook.slice(
      hook.indexOf('useLayoutEffect(() => {'),
      hook.indexOf('// ---- Done')
    );
    const marks = [...effect.matchAll(/markBridgeSeen\(/g)].map((m) => m.index ?? -1);
    expect(marks).toHaveLength(1);

    // The one claim is inside a setTimeout, at the moment the sequence
    // ends — never in the same tick the guard was read.
    const claim = effect.slice(effect.indexOf('const claim = setTimeout'));
    expect(claim).toContain('markBridgeSeen(');
    expect(claim).toContain('PRIORITY_BRIDGE_AT_MS.today');
    expect(marks[0]).toBeGreaterThan(effect.indexOf('const claim = setTimeout'));

    // And it is cleared on unmount, so a remount genuinely re-decides.
    expect(effect).toContain('clearTimeout(claim)');
  });

  it('an unavailable sessionStorage lets the sequence replay rather than throwing', () => {
    const hook = read('components/priority/usePriorityCardMotion.ts');
    const readFn = hook.slice(hook.indexOf('function readBridgeSeen'), hook.indexOf('function markBridgeSeen'));
    expect(readFn).toContain('catch');
    expect(readFn).toContain('return false');
  });

  it('the pop-up writes the day\'s guard without reading it, so the mount race has one outcome', () => {
    const hook = read('components/priority/usePriorityCardMotion.ts');
    expect(hook).toContain("surface !== 'popup' && readBridgeSeen(");
    expect(read('components/priority/PriorityCardPopup.tsx')).toContain("status, 'popup'");
    expect(read('components/priority/PriorityCard.tsx')).toContain("status, 'inline'");
  });
});

// =====================================================================
// Copy.
// =====================================================================

describe('the bridge copy', () => {
  it('has no em dashes anywhere in it', () => {
    for (const text of [PRIORITY_BRIDGE_TEXT, PRIORITY_BRIDGE_YESTERDAY_LABEL]) {
      expect(text).not.toContain('—');
      expect(text).not.toContain('--');
    }
  });

  it('ends in an ellipsis, because it is a bridge and not a statement', () => {
    expect(PRIORITY_BRIDGE_TEXT).toBe('Building on yesterday...');
  });

  it('makes no claim about how well she did', () => {
    const lowered = `${PRIORITY_BRIDGE_TEXT} ${PRIORITY_BRIDGE_YESTERDAY_LABEL}`.toLowerCase();
    for (const word of ['streak', 'well done', 'great', 'congrat', 'nice work', 'you should']) {
      expect(lowered).not.toContain(word);
    }
  });
});

// =====================================================================
// Performance.
// =====================================================================

describe('the motion stays cheap on a mid-range phone', () => {
  it('animates transform and opacity only, with one documented exception', () => {
    const css = read('app/globals.css');
    for (const name of ['mef-recede', 'mef-settle-down']) {
      const block = css.slice(css.indexOf(`@keyframes ${name}`), css.indexOf(`.${name} {`));
      const properties = [...block.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
      expect(properties.length).toBeGreaterThan(0);
      for (const property of properties) {
        expect(['opacity', 'transform']).toContain(property);
      }
    }
  });

  it('the one layout-animating class is the expand, and it caps nothing', () => {
    const css = read('app/globals.css');
    const rule = css.slice(css.indexOf('.mef-expand {'), css.indexOf('.mef-expand > *'));
    expect(rule).toContain('grid-template-rows');
    // A max-height cap is the alternative that silently truncates long
    // help text, and JS measurement is the real layout-thrash failure
    // mode. Neither appears here or anywhere in the components.
    expect(rule).not.toContain('max-height');
    for (const file of [
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
    ]) {
      expect(readCode(file)).not.toContain('offsetHeight');
      expect(readCode(file)).not.toContain('getBoundingClientRect');
    }
  });

  it('no travel distance exceeds the vocabulary\'s own ceiling', () => {
    const css = read('app/globals.css');
    const start = css.indexOf('ROOT MOTION SYSTEM — state-change primitives');
    // Bounded to this build's own block, which ends at the last of the
    // four classes' reduced-motion overrides.
    const end = css.indexOf('.mef-settle-down {', css.indexOf('@keyframes mef-settle-down'));
    const ourBlocks = css.slice(start, end);
    const travels = [...ourBlocks.matchAll(/translateY\((-?\d+)px\)/g)].map((m) =>
      Math.abs(Number(m[1]))
    );
    expect(travels.length).toBeGreaterThan(0);
    for (const travel of travels) {
      expect(travel).toBeLessThanOrEqual(14);
    }
  });
});
