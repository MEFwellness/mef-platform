/**
 * THE ROOT MAP OPENS ON THE MAP.
 *
 * The arrival greeting's own call to action is "See my Root Map". What it
 * landed on, measured on production at a 390x844 phone before anything was
 * changed: 4853px of page. The one-thing line, then the ring, then its
 * colour key, then twelve names running from 560px to 865px, and only at
 * 1105px, two screens below the fold, the single line saying what had
 * actually been noticed.
 *
 * Nothing was deleted and nothing the map computes was touched. What this
 * file locks is the ORDER and the FOLD: the map, its colour key and one
 * counted line of orientation come first; the one thing and the named area
 * follow; and the twelve entries, with the numbered key that names them,
 * are present in full inside one reveal.
 *
 * And the thing that must not drift: the counted line and the gold
 * segments read the same predicate, so a member is never told a number the
 * picture does not draw.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildRootMapOrientationLine,
  ROOT_MAP_ALL_AREAS_LABEL,
  ROOT_MAP_TAP_HINT,
} from '@/lib/root-map';
import { ALL_AREAS_SECTION_ID } from '@/lib/root-map/anchors';
import { colorFor, noticedDomainCount, type RingDomain } from '../components/root-map/ringDomains';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf-8');
const PAGE = read('app/root-map/page.tsx');
/** Prose in this file names the old order while explaining the new one. */
const PAGE_CODE = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  // Order is asserted over the rendered body, not over the import list at
  // the top, where every one of these names also appears.
  .slice(PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').indexOf('export default async function RootMapPage'));

function domain(overrides: Partial<RingDomain> = {}): RingDomain {
  return {
    domain: 'sleep_circadian_rhythm',
    label: 'Sleep and your daily rhythm',
    whatWeUnderstand: [],
    isUninstrumented: false,
    ...overrides,
  } as RingDomain;
}

const at = (needle: string): number => {
  const index = PAGE_CODE.indexOf(needle);
  expect(index, `not in the page: ${needle}`).toBeGreaterThan(-1);
  return index;
};

describe('the first screenful', () => {
  it('opens with the ring, before anything else on the page', () => {
    expect(at('<RootMapRing')).toBeLessThan(at('<TodaysFocusLine'));
    expect(at('<RootMapRing')).toBeLessThan(at("What We&apos;re Noticing Overall"));
    expect(at('<RootMapRing')).toBeLessThan(at('<details'));
  });

  it('draws it smaller, and changes nothing about what it draws', () => {
    expect(PAGE_CODE).toMatch(/<RootMapRing domains=\{ringDomains\} coverageByDomain=\{rootMap\.coverageByDomain\} size=\{208\} \/>/);
    // The map's own meaning still comes from the map's own component.
    expect(read('components/root-map/RootMapRing.tsx')).toMatch(/fillFractionFor\(domain, coverageByDomain\[domain\.domain\]\)/);
  });

  it('carries the colour key and one line of orientation with the ring', () => {
    // The key is the ring's own, directly under the svg.
    expect(read('components/root-map/RootMapRing.tsx')).toMatch(/Gold: we&apos;ve noticed something here/);
    expect(at('buildRootMapOrientationLine')).toBeGreaterThan(at('<RootMapRing'));
    expect(at('buildRootMapOrientationLine')).toBeLessThan(at('<TodaysFocusLine'));
  });

  it('puts the named area above the twelve entries, not two screens below them', () => {
    expect(at("What We&apos;re Noticing Overall")).toBeLessThan(at('<details'));
    expect(at('looks like a specific area worth exploring further')).toBeLessThan(at('<details'));
  });
});

describe('the twelve are present in full, and folded', () => {
  it('one reveal holds the numbered key and all three groups', () => {
    const open = at('<details');
    const close = at('</details>');
    for (const inside of [
      '<RootMapAreaKey',
      "What We&apos;re Seeing",
      'RootMapBuildingRow',
      '<RootMapNotCoveredSection',
    ]) {
      expect(at(inside), inside).toBeGreaterThan(open);
      expect(at(inside), inside).toBeLessThan(close);
    }
  });

  it('is a native <details> with a visible summary, so it needs no JavaScript', () => {
    expect(PAGE_CODE).toMatch(/<details\s*\n\s*id=\{ALL_AREAS_SECTION_ID\}/);
    expect(PAGE_CODE).toMatch(/<summary/);
    expect(PAGE_CODE).toMatch(/\{ROOT_MAP_ALL_AREAS_LABEL\}/);
    expect(ROOT_MAP_ALL_AREAS_LABEL).toBe('See all 12 areas');
    // Not `open`: folded by default is the whole point.
    expect(PAGE_CODE).not.toMatch(/<details[^>]*\sopen/);
  });

  it('the summary is what a tap on a segment opens, by the id both agree on', () => {
    expect(ALL_AREAS_SECTION_ID).toBe('root-map-all-areas');
    expect(read('components/root-map/scrollToDomain.ts')).toMatch(/ALL_AREAS_SECTION_ID/);
  });

  it('nothing was deleted: every group and the safety statement are still rendered', () => {
    for (const kept of [
      '<RootMapFindingCard',
      '<RootMapBuildingRow',
      '<RootMapNotCoveredSection',
      '{SAFETY_STATEMENT}',
      '<TodaysFocusLine',
    ]) {
      expect(PAGE_CODE, kept).toContain(kept);
    }
  });

  it('still says how to use the map', () => {
    expect(PAGE_CODE).toMatch(/\{ROOT_MAP_TAP_HINT\}/);
    expect(ROOT_MAP_TAP_HINT).toContain('Tap a segment');
  });
});

describe('the counted line says only what the ring draws', () => {
  it('counts exactly the domains the ring paints gold, from the same function', () => {
    const domains = [
      domain({ whatWeUnderstand: [{}] }),
      domain({ domain: 'digestion_gut_health', whatWeUnderstand: [] }),
      domain({ domain: 'stress_nervous_system', whatWeUnderstand: [{}, {}] }),
      // An uninstrumented domain is green like any other domain with
      // nothing found, and must not be counted as noticed.
      domain({ domain: 'purpose_motivation', isUninstrumented: true, whatWeUnderstand: [] }),
    ];
    expect(noticedDomainCount(domains)).toBe(2);
    expect(domains.filter((d) => colorFor(d) === '#F5B700')).toHaveLength(2);
  });

  it('names the population it counted, every time it counts', () => {
    expect(buildRootMapOrientationLine(3, 12)).toBe(
      'Your wellbeing across 12 areas. Gold marks the 3 where something has been noticed so far.'
    );
    expect(buildRootMapOrientationLine(1, 12)).toContain('the one where something has been noticed');
  });

  it('says nothing about a score when nothing has been noticed', () => {
    const zero = buildRootMapOrientationLine(0, 12);
    expect(zero).toContain('Nothing has been noticed in any of them yet');
    expect(zero).not.toContain('0 of');
    expect(zero).toContain('fills in as you check in');
  });

  it('makes no claim beyond noticing: no diagnosis, no score, no measurement', () => {
    for (const line of [
      buildRootMapOrientationLine(0, 12),
      buildRootMapOrientationLine(1, 12),
      buildRootMapOrientationLine(7, 12),
      ROOT_MAP_ALL_AREAS_LABEL,
      ROOT_MAP_TAP_HINT,
    ]) {
      expect(line).not.toContain('—');
      for (const banned of ['diagnos', 'score', 'measur', 'problem', 'risk', 'wrong']) {
        expect(line.toLowerCase(), line).not.toContain(banned);
      }
    }
  });

  it('the page reads the count from the same twelve objects the ring is given', () => {
    expect(PAGE_CODE).toMatch(
      /buildRootMapOrientationLine\(noticedDomainCount\(ringDomains\), ringDomains\.length\)/
    );
    expect(PAGE_CODE).toMatch(/<RootMapRing domains=\{ringDomains\}/);
    expect(PAGE_CODE).toMatch(/<RootMapAreaKey domains=\{ringDomains\} \/>/);
  });
});
