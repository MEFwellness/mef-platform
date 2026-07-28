/**
 * New distribution card in the Progress page's Trends section (2026-07-28):
 * one horizontal bar per real level of whichever check-in metric pill is
 * active, counted across her last 30 recorded days for that field. Real
 * unit tests for the pure math (components-with-JSX aren't renderable in
 * this repo's plain 'node' vitest environment, same standing limitation
 * every other chart test file in this suite states), plus static-source
 * checks for the wiring and the real-scale/real-label facts this task
 * explicitly required reading from the data rather than assuming.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import {
  computeDistribution,
  modalLevelIndex,
  distributionTint,
  recordedValues,
  hasEnoughForDistribution,
  MIN_DAYS_FOR_DISTRIBUTION,
} from '../app/progress/MetricDistributionCard';
import type { TrendPoint } from '../app/progress/MetricTrendChart';
import {
  energyLevelLabel,
  moodLabel,
  stressLabel,
  sleepQualityLabel,
  painLabel,
} from '../lib/energy-forecast/scaleLabels';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

function point(local_date: string, value: number | null): TrendPoint {
  return { id: local_date, local_date, value };
}

describe('recordedValues / hasEnoughForDistribution — the 7-day floor counts real values for THIS field only', () => {
  it('counts only non-null values, ignoring days this specific metric was skipped (e.g. a rotating probe not asked that day)', () => {
    const points = [point('2026-01-01', 3), point('2026-01-02', null), point('2026-01-03', 4)];
    expect(recordedValues(points)).toEqual([3, 4]);
  });

  it('under the floor (6 real values) does not draw bars', () => {
    const points = Array.from({ length: 6 }, (_, i) => point(`2026-01-0${i + 1}`, 3));
    expect(hasEnoughForDistribution(points)).toBe(false);
  });

  it('exactly at the floor (7 real values) does draw bars', () => {
    const points = Array.from({ length: 7 }, (_, i) => point(`2026-01-0${i + 1}`, 3));
    expect(hasEnoughForDistribution(points)).toBe(true);
  });

  it('a dense total of 30 points but only 4 real (non-null) values for this field stays below the floor — density of check-ins overall does not fake density of this one field', () => {
    const points = [
      ...Array.from({ length: 4 }, (_, i) => point(`2026-01-0${i + 1}`, 2)),
      ...Array.from({ length: 26 }, (_, i) => point(`2026-02-${String(i + 1).padStart(2, '0')}`, null)),
    ];
    expect(hasEnoughForDistribution(points)).toBe(false);
    expect(MIN_DAYS_FOR_DISTRIBUTION).toBe(7);
  });
});

describe('computeDistribution — ordered by level, real counts/percentages, honest zero-count levels', () => {
  it('produces one bucket per level in [min,max], in ascending level order — not sorted by size', () => {
    // 10 real days: level 1 x1, level 3 x6, level 5 x3 — level 3 is the largest bucket but must NOT be reordered to the front.
    const points = [
      point('d1', 1),
      ...Array.from({ length: 6 }, (_, i) => point(`d${i + 2}`, 3)),
      ...Array.from({ length: 3 }, (_, i) => point(`d${i + 8}`, 5)),
    ];
    const levels = computeDistribution(points, 1, 5, String);
    expect(levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    expect(levels.map((l) => l.count)).toEqual([1, 0, 6, 0, 3]);
    expect(levels.map((l) => Math.round(l.percent))).toEqual([10, 0, 60, 0, 30]);
  });

  it('a real zero-count level above the floor is honest (not fabricated, not hidden) — the level simply never occurred', () => {
    const points = Array.from({ length: 7 }, () => point('d', 5));
    const levels = computeDistribution(points, 1, 5, String);
    expect(levels.find((l) => l.level === 1)!.count).toBe(0);
    expect(levels.find((l) => l.level === 1)!.percent).toBe(0);
  });

  it('pain\'s real 0-5 range produces 6 buckets, not 5 — the scale genuinely differs from the other five metrics', () => {
    const points = Array.from({ length: 7 }, () => point('d', 0));
    const levels = computeDistribution(points, 0, 5, painLabel);
    expect(levels).toHaveLength(6);
    expect(levels[0]!.level).toBe(0);
    expect(levels[0]!.label).toBe('None');
  });
});

describe('modalLevelIndex — the one bar that turns gold', () => {
  it('picks the level with the highest real count', () => {
    const levels = computeDistribution(
      [point('a', 2), point('b', 2), point('c', 4)],
      1,
      5,
      String
    );
    expect(modalLevelIndex(levels)).toBe(1); // level 2, index 1
  });

  it('breaks a tie toward the lower level, so exactly one bar is ever gold, deterministically', () => {
    const levels = computeDistribution([point('a', 2), point('b', 4)], 1, 5, String);
    // level 2 (index 1) and level 4 (index 3) are tied at count 1 each.
    expect(modalLevelIndex(levels)).toBe(1);
  });

  it('returns null when every bucket is at zero (defensive — should not happen once the 7-day floor is cleared, but must never crash)', () => {
    const levels = computeDistribution([], 1, 5, String);
    expect(modalLevelIndex(levels)).toBeNull();
  });
});

describe('distributionTint — lightest to darkest, never invisible against the dark card, never identical to it', () => {
  const CARD_BG = [0x1b, 0x3a, 0x2d];

  function parseRgb(css: string): number[] {
    return css.replace(/rgb\(|\)/g, '').split(',').map(Number);
  }

  it('the first (lowest-level) tint is the lightest, the last (highest-level) tint is the darkest', () => {
    const first = parseRgb(distributionTint(0, 5));
    const last = parseRgb(distributionTint(4, 5));
    const brightness = (rgb: number[]) => rgb[0]! + rgb[1]! + rgb[2]!;
    expect(brightness(first)).toBeGreaterThan(brightness(last));
  });

  it('every tint in the ramp is distinct from the card\'s own background — no bar can blend invisibly into the ground', () => {
    for (let i = 0; i < 6; i++) {
      const rgb = parseRgb(distributionTint(i, 6));
      const distance = Math.sqrt(
        rgb.reduce((sum, c, idx) => sum + (c - CARD_BG[idx]!) ** 2, 0)
      );
      expect(distance).toBeGreaterThan(40); // a real, visually-distinguishable gap
    }
  });

  it('the ramp is monotonic — no level "jumps back" lighter than an earlier one', () => {
    const brightness = (i: number, count: number) => {
      const rgb = parseRgb(distributionTint(i, count));
      return rgb[0]! + rgb[1]! + rgb[2]!;
    };
    for (let i = 1; i < 6; i++) {
      expect(brightness(i, 6)).toBeLessThanOrEqual(brightness(i - 1, 6));
    }
  });

  it('a single-level ramp (count=1) still returns a real, valid color rather than dividing by zero', () => {
    expect(distributionTint(0, 1)).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });
});

describe('Real scales — read from the live schema, not assumed', () => {
  const SCHEMA_ORIGIN = source('../../supabase/migrations/00000000000013_daily_checkins.sql');
  const SCHEMA_MOOD = source('../../supabase/migrations/00000000000021_daily_checkins_mood_water.sql');

  it('energy/stress/sleep_quality/digestion are genuinely 1-5 per the real Postgres CHECK constraints', () => {
    expect(SCHEMA_ORIGIN).toContain('energy_level int check (energy_level between 1 and 5)');
    expect(SCHEMA_ORIGIN).toContain('stress_level int check (stress_level between 1 and 5)');
    expect(SCHEMA_ORIGIN).toContain('sleep_quality int check (sleep_quality between 1 and 5)');
    expect(SCHEMA_ORIGIN).toContain('digestion_rating int check (digestion_rating between 1 and 5)');
  });

  it('mood is genuinely 1-5 too (added in a later migration)', () => {
    expect(SCHEMA_MOOD).toContain('mood_level int check (mood_level between 1 and 5)');
  });

  it('pain genuinely differs — 0-5, not 1-5 — confirmed by the real constraint, not assumed', () => {
    expect(SCHEMA_ORIGIN).toContain('pain_discomfort_level int check (pain_discomfort_level between 0 and 5)');
  });

  const TRENDS_PANEL = source('app/progress/TrendsPanel.tsx');

  it('TrendsPanel\'s own segment config matches the real schema for every check-in metric', () => {
    const energyIdx = TRENDS_PANEL.indexOf("key: 'energy'");
    const painIdx = TRENDS_PANEL.indexOf("key: 'pain'");
    expect(TRENDS_PANEL.slice(energyIdx, energyIdx + 200)).toContain('min: 1');
    expect(TRENDS_PANEL.slice(painIdx, painIdx + 200)).toContain('min: 0');
  });
});

describe('Real level labels — the same words the check-in itself uses, not invented copy', () => {
  const CHECKIN_FORM = source('app/checkin/CheckinForm.tsx');

  it('energy/mood/stress/sleep_quality word sets in scaleLabels.ts are verbatim identical to CheckinForm.tsx\'s own MEANING arrays', () => {
    expect(CHECKIN_FORM).toContain("const MOOD_MEANING = ['Very Low', 'Low', 'Okay', 'Good', 'Excellent']");
    expect(CHECKIN_FORM).toContain("const ENERGY_MEANING = ['Exhausted', 'Low', 'Moderate', 'Good', 'High']");
    expect(CHECKIN_FORM).toContain("const STRESS_MEANING = ['Very Calm', 'Calm', 'Moderate', 'High', 'Overwhelmed']");
    expect(CHECKIN_FORM).toContain(
      "const SLEEP_QUALITY_MEANING = ['Terrible', 'Poor', 'Fair', 'Good', 'Excellent']"
    );
    expect(energyLevelLabel(1)).toBe('Exhausted');
    expect(energyLevelLabel(5)).toBe('High');
    expect(moodLabel(1)).toBe('Very Low');
    expect(moodLabel(4)).toBe('Good');
    expect(stressLabel(5)).toBe('Overwhelmed');
    expect(sleepQualityLabel(3)).toBe('Fair');
  });

  it('pain\'s 6-word severity scale matches the exact word set CheckinForm.tsx hands to BodySeverityOutline', () => {
    expect(CHECKIN_FORM).toContain(
      "const SEVERITY_MEANING = ['None', 'Mild', 'Mild-moderate', 'Moderate', 'Significant', 'Severe']"
    );
    expect(CHECKIN_FORM).toContain('severityLabels={SEVERITY_MEANING}');
    expect(painLabel(0)).toBe('None');
    expect(painLabel(5)).toBe('Severe');
  });

  it('digestion has no real word scale anywhere in the check-in UI — TrendsPanel uses plain numbers for it, not invented wording', () => {
    const DRIVER_PROBE_FIELD = source('components/checkin/DriverProbeField.tsx');
    expect(DRIVER_PROBE_FIELD).toContain('SCALE_ANCHOR_LABELS');
    expect(DRIVER_PROBE_FIELD).not.toContain("'checkin_probe.digestion_rating':");
    const digestionIdx = source('app/progress/TrendsPanel.tsx').indexOf("key: 'digestion'");
    const digestionBlock = source('app/progress/TrendsPanel.tsx').slice(digestionIdx, digestionIdx + 700);
    expect(digestionBlock).toContain('(level: number) => String(level)');
  });
});

describe('Wiring: distribution card sits below the line chart, check-in segments only', () => {
  const TRENDS_PANEL = source('app/progress/TrendsPanel.tsx');

  it('imports and renders MetricDistributionCard', () => {
    expect(TRENDS_PANEL).toContain(
      "import { MetricDistributionCard } from './MetricDistributionCard'"
    );
    expect(TRENDS_PANEL).toContain('<MetricDistributionCard');
  });

  it('MetricTrendChart (the untouched line chart) renders before MetricDistributionCard, not after', () => {
    const chartIdx = TRENDS_PANEL.indexOf('<MetricTrendChart');
    const distIdx = TRENDS_PANEL.indexOf('<MetricDistributionCard');
    expect(chartIdx).toBeGreaterThan(-1);
    expect(distIdx).toBeGreaterThan(chartIdx);
  });

  it('gated on group === \'checkin\' — a wearable segment (continuous, not a small level set) never renders it', () => {
    expect(TRENDS_PANEL).toMatch(/active\.group === 'checkin' && active\.levelLabel &&/);
  });

  it('passes resetKey so switching metric pills re-triggers the sweep-in, the same pattern TrendChartCard already uses for its range pills', () => {
    const distIdx = TRENDS_PANEL.indexOf('<MetricDistributionCard');
    expect(TRENDS_PANEL.slice(distIdx, distIdx + 250)).toContain('resetKey={active.key}');
  });
});

describe('Reuses the existing scroll-into-view mechanism, not a new one', () => {
  const CARD_SRC = source('app/progress/MetricDistributionCard.tsx');

  it('imports and wraps bars in the shared components/ScrollDrawIn.tsx — no new IntersectionObserver written', () => {
    expect(CARD_SRC).toContain("import { ScrollDrawIn } from '@/components/ScrollDrawIn'");
    expect(CARD_SRC).toContain('<ScrollDrawIn resetKey={resetKey}>');
    expect(CARD_SRC).not.toContain('IntersectionObserver');
  });
});

describe('Colors: deep green ground pulled from the existing dark card, gold used exactly once', () => {
  const CARD_SRC = source('app/progress/MetricDistributionCard.tsx');
  const COACHING_INSIGHTS = source('app/progress/CoachingInsightsPanel.tsx');

  it('the card ground is the same forest green hex the page\'s one other dark card already uses — pulled, not reinvented', () => {
    expect(CARD_SRC).toContain("const CARD_BG = '#1B3A2D'");
    expect(COACHING_INSIGHTS).toContain('#1B3A2D');
  });

  it('gold appears exactly once in the component\'s logic — only as the modal bar\'s fill', () => {
    const goldMatches = CARD_SRC.match(/GOLD/g) ?? [];
    // One const declaration + one usage site (the ternary assigning `fill`).
    expect(goldMatches.length).toBe(2);
    expect(CARD_SRC).toContain("i === modalIndex ? GOLD : distributionTint");
  });

  it('no second-person violation: heading is phrased in second person, never "the member"', () => {
    expect(CARD_SRC).toContain('What a typical day looks like for you');
    expect(CARD_SRC.toLowerCase()).not.toContain('the member');
  });
});

describe('Removed: the Streak/Check-ins/Avg Energy stats card below Trends — Avg Energy kept, the other two confirmed elsewhere first', () => {
  const CONSISTENCY_PANEL = source('app/progress/ConsistencyPanel.tsx');
  const PROGRESS_PAGE = source('app/progress/page.tsx');

  it('ConsistencyPanel only accepts averageEnergy now — Streak and Check-ins are gone from its props and markup', () => {
    expect(CONSISTENCY_PANEL).toContain(
      'export function ConsistencyPanel({ averageEnergy }: { averageEnergy: number | null })'
    );
    expect(CONSISTENCY_PANEL).not.toContain('checkinCount');
    expect(CONSISTENCY_PANEL).not.toContain('Flame');
    expect(CONSISTENCY_PANEL).not.toMatch(/grid-cols-3/);
  });

  it('the page no longer computes or imports a streak, and passes only averageEnergy to the panel', () => {
    expect(PROGRESS_PAGE).not.toContain('calculateStreak');
    expect(PROGRESS_PAGE).not.toContain("from './streak'");
    expect(PROGRESS_PAGE).toContain('<ConsistencyPanel averageEnergy={averageEnergy} />');
  });

  it('app/progress/streak.ts is deleted — it had exactly one consumer (this page) and no longer has any', () => {
    const filePath = path.resolve(__dirname, '..', 'app/progress/streak.ts');
    expect(existsSync(filePath)).toBe(false);
  });

  it('Streak really does still appear elsewhere: Today\'s streak message uses the identical run-length algorithm, not a divergent redefinition', () => {
    const ACCOUNTABILITY = source('lib/ai/agents/accountability.ts');
    const STREAK_INTELLIGENCE = source('lib/feed/streakIntelligence.ts');
    const TODAY_PAGE = source('app/today/page.tsx');
    expect(ACCOUNTABILITY).toContain('export function currentStreakLength');
    expect(STREAK_INTELLIGENCE).toContain('currentStreakLength(checkinsOldestFirst)');
    expect(STREAK_INTELLIGENCE).toContain('days in a row');
    expect(TODAY_PAGE).toContain('buildStreakMessage');
  });

  it('Check-ins really does still appear elsewhere: Today\'s Accomplished zone shows a real, query-backed cumulative total (a different window — all-time, not last-30-days — flagged honestly, not claimed identical)', () => {
    const TODAY_PAGE = source('app/today/page.tsx');
    expect(TODAY_PAGE).toContain('totalCheckins');
  });

  it('Avg Energy genuinely does not appear anywhere else — confirmed by grep before deleting, kept per the task\'s own escape hatch', () => {
    const usages = execSync(
      `grep -rl "averageEnergy\\|avgEnergy" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v test`,
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(usages.sort()).toEqual(
      ['./app/progress/ConsistencyPanel.tsx', './app/progress/page.tsx'].sort()
    );
  });
});
