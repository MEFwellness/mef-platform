/**
 * Fixes a real, reported bug: auto-advance used to fire the instant a
 * screen's required units were answered, with zero regard for an
 * optional unit sitting right there (already visible, or freshly
 * revealed by that very answer) — "answer stress as High, the
 * 'What's most of today's stress coming from?' follow-up appears, and
 * the screen auto-advances before it can be answered." hooks/useScreenAutoAdvance.ts
 * now only arms its pause once nothing about the visible unit list has
 * changed for pauseMs, which is what screenSettleSignature exists to
 * detect. useScreenAutoAdvance itself uses React hooks and can't be
 * executed directly in this repo's plain 'node' vitest environment (no
 * jsdom/RTL, no react-test-renderer) — so this pins down the pure
 * decision logic the hook is built from instead, the same
 * source-level-guard approach every other check-in test in this repo
 * already uses for hook/component logic that can't be rendered.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isRequiredComplete,
  screenSettleSignature,
  type ScreenUnitLike,
} from '../hooks/useScreenAutoAdvance';

function unit(overrides: Partial<ScreenUnitLike> = {}): ScreenUnitLike {
  return { key: 'x', required: false, answered: false, ...overrides };
}

describe('isRequiredComplete — unchanged rule: optional units never block completeness', () => {
  it('true once every required unit is answered, regardless of optional ones', () => {
    const screen = [
      unit({ key: 'mood', required: true, answered: true }),
      unit({ key: 'energy', required: true, answered: true }),
      unit({ key: 'stress', required: true, answered: true }),
      unit({ key: 'stress_source_today', required: false, answered: false }),
    ];
    expect(isRequiredComplete(screen)).toBe(true);
  });

  it('false while any required unit is unanswered', () => {
    const screen = [
      unit({ key: 'mood', required: true, answered: true }),
      unit({ key: 'stress', required: true, answered: false }),
    ];
    expect(isRequiredComplete(screen)).toBe(false);
  });
});

describe('screenSettleSignature — the actual fix: a revealed or newly-answered unit changes the signature, which is what re-arms the auto-advance pause', () => {
  it('the stress-follow-up scenario: revealing stress_source_today after answering stress changes the signature even though required-completeness was already true', () => {
    const beforeReveal = [
      unit({ key: 'mood', required: true, answered: true }),
      unit({ key: 'energy', required: true, answered: true }),
      unit({ key: 'stress', required: true, answered: true }),
    ];
    const afterReveal = [
      ...beforeReveal,
      unit({ key: 'checkin_probe.stress_source_today', required: false, answered: false }),
    ];
    expect(isRequiredComplete(beforeReveal)).toBe(true);
    expect(isRequiredComplete(afterReveal)).toBe(true);
    // Required-completeness alone can't tell these two moments apart —
    // that's the bug. The signature can: a new unit appeared.
    expect(screenSettleSignature(afterReveal)).not.toBe(screenSettleSignature(beforeReveal));
  });

  it('answering the newly-revealed optional follow-up changes the signature again, re-arming the pause a second time', () => {
    const revealed = [unit({ key: 'stress', required: true, answered: true }), unit({ key: 'stress_source_today', required: false, answered: false })];
    const answered = [unit({ key: 'stress', required: true, answered: true }), unit({ key: 'stress_source_today', required: false, answered: true })];
    expect(screenSettleSignature(revealed)).not.toBe(screenSettleSignature(answered));
  });

  it('the exact digestion_rating -> digestive_symptom_type chain from the DB-driven local-follow-up bank', () => {
    const beforeAnswer = [unit({ key: 'checkin_probe.digestion_rating', required: false, answered: false })];
    const lowDigestionAnswered = [unit({ key: 'checkin_probe.digestion_rating', required: false, answered: true })];
    const revealedFollowUp = [
      ...lowDigestionAnswered,
      unit({ key: 'checkin_probe.digestive_symptom_type', required: false, answered: false }),
    ];
    expect(screenSettleSignature(beforeAnswer)).not.toBe(screenSettleSignature(lowDigestionAnswered));
    expect(screenSettleSignature(lowDigestionAnswered)).not.toBe(screenSettleSignature(revealedFollowUp));
  });

  it('identical screens (nothing changed) produce an identical signature — the "stable for pauseMs" half of settled', () => {
    const a = [unit({ key: 'mood', required: true, answered: true }), unit({ key: 'notes', required: false, answered: false })];
    const b = [unit({ key: 'mood', required: true, answered: true }), unit({ key: 'notes', required: false, answered: false })];
    expect(screenSettleSignature(a)).toBe(screenSettleSignature(b));
  });

  it('every conditional local follow-up in the bank changes the signature when revealed (full audit, task: "audit every conditional follow-up ... report which questions were affected")', () => {
    const parentAnswerRevealsFollowUp: Array<{ parentKey: string; followUpKey: string }> = [
      { parentKey: 'checkin_probe.bedtime_later_than_wanted', followUpKey: 'checkin_probe.what_kept_you_up' },
      { parentKey: 'checkin_probe.medication_or_supplement_change', followUpKey: 'checkin_probe.what_changed' },
      { parentKey: 'checkin_probe.last_meal_timing', followUpKey: 'checkin_probe.late_eating_reason' },
      { parentKey: 'checkin_probe.meals_skipped_today', followUpKey: 'checkin_probe.skipped_meal_which' },
      { parentKey: 'checkin_probe.energy_crash_today', followUpKey: 'checkin_probe.crash_timing' },
      { parentKey: 'checkin_probe.alcohol_present', followUpKey: 'checkin_probe.alcohol_drinks_count' },
      { parentKey: 'checkin_probe.digestion_rating', followUpKey: 'checkin_probe.digestive_symptom_type' },
      { parentKey: 'checkin_probe.desk_hours_today', followUpKey: 'checkin_probe.got_up_hourly' },
      { parentKey: 'checkin_probe.emotional_load_today', followUpKey: 'checkin_probe.emotional_load_source' },
    ];
    for (const { parentKey, followUpKey } of parentAnswerRevealsFollowUp) {
      const before = [unit({ key: parentKey, required: false, answered: true })];
      const after = [...before, unit({ key: followUpKey, required: false, answered: false })];
      expect(screenSettleSignature(before), `${followUpKey} reveal not detected`).not.toBe(screenSettleSignature(after));
    }
  });

  it('the two hardcoded pain follow-ups (pain_location -> pain_aggravating_factor) also change the signature when revealed', () => {
    const severityOnly = [unit({ key: 'body-severity', required: true, answered: false })];
    const locationAnswered = [unit({ key: 'body-severity', required: true, answered: true })];
    const aggravatingRevealed = [...locationAnswered, unit({ key: 'pain-aggravating-factor', required: false, answered: false })];
    expect(screenSettleSignature(severityOnly)).not.toBe(screenSettleSignature(locationAnswered));
    expect(screenSettleSignature(locationAnswered)).not.toBe(screenSettleSignature(aggravatingRevealed));
  });
});

describe('Continue is structurally independent of auto-advance — it must still work even if settle-detection never fires', () => {
  function source(relativePath: string): string {
    return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
  }

  const MORNING_FORM = source('app/checkin/CheckinForm.tsx');
  const EVENING_FORM = source('app/checkin/evening/EveningReflectionForm.tsx');
  const WIZARD = source('components/checkin/CheckinWizard.tsx');

  it('handleContinue calls goNext/performSave directly, never through useScreenAutoAdvance or its onAdvance callback', () => {
    for (const formSource of [MORNING_FORM, EVENING_FORM]) {
      const start = formSource.indexOf('function handleContinue()');
      const block = formSource.slice(start, formSource.indexOf('\n  }', start));
      expect(block).not.toContain('useScreenAutoAdvance');
      expect(block).not.toContain('advanceRef');
    }
  });

  it("CheckinWizard's persistent Continue button is wired to the onContinue prop directly, not gated on any settle/advance state passed down from the hook", () => {
    const buttonBlock = WIZARD.slice(WIZARD.indexOf('onClick={onContinue}'), WIZARD.indexOf('</button>', WIZARD.indexOf('onClick={onContinue}')));
    expect(buttonBlock).toContain('disabled={continueDisabled}');
    expect(buttonBlock).not.toContain('useScreenAutoAdvance');
  });

  it('both forms still call useScreenAutoAdvance only as an additional convenience alongside goNext, never replacing it', () => {
    for (const formSource of [MORNING_FORM, EVENING_FORM]) {
      expect(formSource).toContain('useScreenAutoAdvance(currentScreen, clampedIndex, goNext)');
    }
  });
});
