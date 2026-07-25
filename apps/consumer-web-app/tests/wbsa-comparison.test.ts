import { describe, it, expect } from 'vitest';
import { compareWbsaSystemBreakdowns } from '../lib/wbsa/comparison';
import { fromWbsaDirection } from '../lib/assessment-comparison/adapters';
import type { WbsaSystemBreakdownRow } from '../lib/wbsa/results';

function row(title: string, band: WbsaSystemBreakdownRow['band']): WbsaSystemBreakdownRow {
  return { sectionId: title, title, subtitle: null, displayOrder: 0, band, findingCount: 0, skippedCount: 0 };
}

describe('lib/wbsa/comparison — retake previous-vs-current', () => {
  it('marks a system improved when its band drops (needs_context -> watch)', () => {
    const rows = compareWbsaSystemBreakdowns([row('Sleep', 'needs_context')], [row('Sleep', 'watch')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.trend).toBe('improved');
  });

  it('marks a system declined when its band rises (lower -> needs_context)', () => {
    const rows = compareWbsaSystemBreakdowns([row('Sleep', 'lower')], [row('Sleep', 'needs_context')]);
    expect(rows[0]!.trend).toBe('declined');
  });

  it('marks a system stable when the band is unchanged', () => {
    const rows = compareWbsaSystemBreakdowns([row('Sleep', 'watch')], [row('Sleep', 'watch')]);
    expect(rows[0]!.trend).toBe('stable');
  });

  it('marks a system unknown when present on only one side', () => {
    const onlyLater = compareWbsaSystemBreakdowns([], [row('Sleep', 'watch')]);
    expect(onlyLater[0]!.trend).toBe('unknown');

    const onlyEarlier = compareWbsaSystemBreakdowns([row('Sleep', 'watch')], []);
    expect(onlyEarlier[0]!.trend).toBe('unknown');
  });

  it('produces one row per system present on either side', () => {
    const rows = compareWbsaSystemBreakdowns(
      [row('Sleep', 'watch'), row('Skin', 'lower')],
      [row('Sleep', 'lower'), row('Immune', 'needs_context')]
    );
    expect(rows.map((r) => r.sectionTitle).sort()).toEqual(['Immune', 'Skin', 'Sleep']);
  });
});

describe('lib/assessment-comparison/adapters — fromWbsaDirection', () => {
  it('translates every WbsaComparisonTrend value into the canonical ComparisonDirection', () => {
    expect(fromWbsaDirection('improved')).toBe('improved');
    expect(fromWbsaDirection('declined')).toBe('worsened');
    expect(fromWbsaDirection('stable')).toBe('unchanged');
    expect(fromWbsaDirection('unknown')).toBeNull();
  });
});
