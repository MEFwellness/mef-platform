import { describe, expect, it } from 'vitest';
import { isValidQuestionKey, slugifyPrompt } from '../lib/driver-probe-admin/slug';

describe('slugifyPrompt', () => {
  it('generates a checkin_probe. prefixed key from prompt text', () => {
    expect(slugifyPrompt('Did you sleep well last night?')).toBe(
      'checkin_probe.did_you_sleep_well_last_night'
    );
  });

  it('strips apostrophes and collapses punctuation', () => {
    expect(slugifyPrompt("What's kept you up — work or something else?")).toBe(
      'checkin_probe.whats_kept_you_up_work_or_something_else'
    );
  });

  it('never produces the bare prefix for empty input', () => {
    expect(slugifyPrompt('???')).toBe('checkin_probe.question');
  });
});

describe('isValidQuestionKey', () => {
  it('accepts a checkin_probe. prefixed key', () => {
    expect(isValidQuestionKey('checkin_probe.something')).toBe(true);
  });

  it('rejects a key that could collide with a fixed-core key', () => {
    expect(isValidQuestionKey('checkin.mood')).toBe(false);
  });

  it('rejects a bare prefix with nothing after it', () => {
    expect(isValidQuestionKey('checkin_probe.')).toBe(false);
  });
});
