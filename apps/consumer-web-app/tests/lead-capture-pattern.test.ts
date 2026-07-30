import { describe, it, expect } from 'vitest';
import { determinePatternName, PATTERN_LABELS } from '../lib/lead-capture/pattern';

describe('lead-capture pattern — determinePatternName', () => {
  it('pain: an "all over" answer is an overload pattern regardless of what was tried', () => {
    expect(determinePatternName('pain', 'All Over', 'Nothing Yet')).toBe('overload_pattern');
    expect(determinePatternName('pain', 'all over the place', 'tried a lot of things')).toBe('overload_pattern');
  });

  it('pain: a specific spot with something already tried is a compensation pattern', () => {
    expect(determinePatternName('pain', 'Lower Back', 'Stretching/Foam Rolling')).toBe('compensation_pattern');
  });

  it('pain: a specific spot with nothing tried is a recovery deficit', () => {
    expect(determinePatternName('pain', 'Lower Back', 'Nothing Yet')).toBe('recovery_deficit');
  });

  it('energy: an afternoon dip is a fuel timing pattern', () => {
    expect(determinePatternName('energy', 'Mid-Afternoon', 'More Caffeine')).toBe('fuel_timing_pattern');
  });

  it('energy: all-day fatigue is a depletion pattern', () => {
    expect(determinePatternName('energy', 'All Day', 'More Sleep')).toBe('depletion_pattern');
  });

  it('energy: anything else defaults to a recovery deficit', () => {
    expect(determinePatternName('energy', 'Morning', 'More Sleep')).toBe('recovery_deficit');
  });

  it('sleep: trouble falling asleep specifically is a wind-down deficit', () => {
    expect(determinePatternName('sleep', 'Falling Asleep', 'Melatonin')).toBe('wind_down_deficit');
    expect(determinePatternName('sleep', "I can't fall asleep most nights", 'Melatonin')).toBe('wind_down_deficit');
  });

  it('sleep: anything else is a rhythm disruption', () => {
    expect(determinePatternName('sleep', 'Waking Up Tired', 'Nothing Yet')).toBe('rhythm_disruption');
  });

  it('stress: "all of it" is an overload pattern', () => {
    expect(determinePatternName('stress', 'All Of It', 'Meditation/Breathing')).toBe('overload_pattern');
  });

  it('stress: anything else is a stress-loading pattern', () => {
    expect(determinePatternName('stress', 'Mind Racing', 'Exercise')).toBe('stress_loading_pattern');
  });

  it('general always defaults to an overload pattern', () => {
    expect(determinePatternName('general', 'Physical', 'Not Sure')).toBe('overload_pattern');
  });

  it('weight: a big life change is a stress-storage pattern', () => {
    expect(determinePatternName('weight', 'Since A Big Life Change', 'Nothing Yet')).toBe('stress_storage_pattern');
    expect(determinePatternName('weight', 'started after a lot of stress at work', 'Nothing Yet')).toBe(
      'stress_storage_pattern'
    );
  });

  it('weight: stuck despite real effort is a metabolic adaptation pattern', () => {
    expect(determinePatternName('weight', 'Slow Despite Effort', 'Cutting Calories')).toBe(
      'metabolic_adaptation_pattern'
    );
  });

  it('weight: stuck despite effort but nothing actually tried yet falls back to fuel timing', () => {
    expect(determinePatternName('weight', 'Slow Despite Effort', 'Nothing Yet')).toBe('fuel_timing_pattern');
  });

  it('weight: cravings/appetite or energy crashes default to a fuel timing pattern', () => {
    expect(determinePatternName('weight', 'Cravings/Appetite', 'Tracking Everything')).toBe('fuel_timing_pattern');
    expect(determinePatternName('weight', 'Energy Crashes', 'More Cardio')).toBe('fuel_timing_pattern');
  });

  it('a typed free-text answer is classified the same way a matching button label would be', () => {
    const viaButton = determinePatternName('pain', 'All Over', 'Nothing Yet');
    const viaTyping = determinePatternName('pain', "it's pretty much everywhere at this point", "haven't tried anything");
    expect(viaTyping).toBe(viaButton);
  });

  it('every pattern name has a non-clinical, observational label', () => {
    Object.values(PATTERN_LABELS).forEach((label) => {
      expect(label).toMatch(/^(a|an) /);
    });
  });
});
