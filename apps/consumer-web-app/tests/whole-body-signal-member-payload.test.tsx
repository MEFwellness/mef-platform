// @vitest-environment jsdom

/**
 * THE WIRING GUARD. It fails if any practitioner field reaches a member
 * response.
 *
 * The brief for this instrument says the member layer and the coach layer
 * are almost two different products, and that the practitioner half is
 * "filtered out of the member payload entirely at the data layer, not
 * hidden in the UI". This file is what makes that a fact rather than an
 * intention, and it checks it four ways, because each one catches
 * something the others cannot:
 *
 *   1. THE SELECT. loadMemberContent's own column list is read out of the
 *      source. A column never asked for cannot be in the payload however
 *      the code downstream is written.
 *   2. THE BUILT OBJECT. The real MemberResultsView is built from the real
 *      seeded content and a real set of answers, then walked key by key
 *      and value by value against the practitioner vocabulary. This is the
 *      one that would catch a field added later.
 *   3. THE IMPORT GRAPH. Every member surface is followed through its own
 *      imports, and the three practitioner modules must be unreachable
 *      from all of them.
 *   4. THE RENDERED SCREEN. Her results are rendered and the text is
 *      scanned, because innerText is what she actually reads.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { buildResults } from '../lib/whole-body-signal/results';
import { buildMemberResultsView } from '../lib/whole-body-signal/memberView';
import { WholeBodySignalResults } from '../components/whole-body-signal/WholeBodySignalResults';
import {
  answerAll,
  BANDS,
  BRANCH_RULES,
  MEMBER_COPY,
  QUESTIONS,
  SCALE,
  SECTIONS,
  SETTINGS,
  ZONE_ORDER,
} from './whole-body-signal-fixture';

const ROOT = path.resolve(__dirname, '..');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/**
 * The words a member may never read about herself from this instrument,
 * and the field names those words would arrive in.
 */
const PRACTITIONER_FIELDS = [
  'zone',
  'zoneKey',
  'zoneName',
  'primaryZone',
  'secondaryZone',
  'chakra',
  'chakraLens',
  'organ',
  'organGland',
  'organGlandList',
  'gland',
  'spinal',
  'spinalSegments',
  'coachTopic',
  'color',
  'colorKey',
  'coachColor',
  'percent',
  'percentage',
  'points',
  'possible',
  'signal',
  'signalLoad',
  'load',
  'componentA',
  'componentB',
  'componentC',
  'direction',
  'score',
];

const PRACTITIONER_WORDS = [
  /\bzone\b/i,
  /\bchakra\b/i,
  /\bsolar plexus\b/i,
  /\bthird eye\b/i,
  /\bsacral\b/i,
  /\bpancreas\b/i,
  /\badrenal/i,
  /\bthyroid\b/i,
  /\bgonad/i,
  /\bpineal\b/i,
  /\bpituitary\b/i,
  /\bthymus\b/i,
  /\bpericardium\b/i,
  /\blarge intestines\b/i,
  /\bT[1-9]\d? to T\d/,
  /\bC[1-9] to C\d/,
  /\bL[1-9] to L\d/,
];

/** Every key and every string this object holds, however deeply nested. */
function walk(value: unknown, at: string, keys: string[], strings: { at: string; text: string }[]) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    strings.push({ at, text: value });
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${at}[${index}]`, keys, strings));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    keys.push(`${at}.${key}`);
    walk(entry, `${at}.${key}`, keys, strings);
  }
}

function buildRealView() {
  const routingOptionKey = 'changing';
  const answers = answerAll(routingOptionKey, 'often');
  const results = buildResults({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    branchRules: BRANCH_RULES,
    zoneOrder: ZONE_ORDER,
    answers,
    routingOptionKey,
    settings: SETTINGS,
  });
  const view = buildMemberResultsView({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    branchRules: BRANCH_RULES,
    answers,
    results,
    settings: SETTINGS,
  });
  return { results, view };
}

describe('1. the select: a practitioner column is never even asked for', () => {
  const source = read('lib/whole-body-signal/contentData.ts');

  it('the member question columns are the member ones and nothing else', () => {
    const match = source.match(/const MEMBER_QUESTION_COLUMNS =\s*\n?\s*'([^']+)'/);
    expect(match, 'MEMBER_QUESTION_COLUMNS not found').toBeTruthy();
    const columns = match![1]!.split(',').map((column) => column.trim());
    expect(columns.sort()).toEqual(
      [
        'allows_pnta',
        'branch_group',
        'is_universal',
        'position',
        'prompt',
        'question_ref',
        // Which answers her screen draws. Not a practitioner column: it
        // says what she is offered, never what it means.
        'scale_key',
        'section_key',
      ].sort()
    );
  });

  it('the answering screen draws the options of THE QUESTION IN FRONT OF HER', () => {
    // Two scales share one option list, so a screen mapping the whole
    // bundle would offer eight answers on every question.
    const screen = read('components/whole-body-signal/WholeBodySignalExperience.tsx');
    expect(screen).toContain('optionsForQuestion(content.scale, question)');
    expect(screen).not.toContain('content.scale.map');
  });

  it('the member bundle asks for no Zone, pattern or coaching library row', () => {
    const memberLoader = source.slice(
      source.indexOf('export async function loadMemberContent'),
      source.indexOf('export async function loadReadingContent')
    );
    expect(memberLoader).not.toContain('fetchZones');
    expect(memberLoader).not.toContain('fetchPatterns');
    expect(memberLoader).not.toContain('fetchCoachingLibrary');
    expect(memberLoader).not.toContain("fetchCopy(supabase, 'coach')");
    expect(memberLoader).not.toContain('fetchBands');
  });

  it('the reading bundle, which runs on her own request, asks for no practitioner WORDS either', () => {
    const match = source.match(/const READING_QUESTION_COLUMNS = `\$\{MEMBER_QUESTION_COLUMNS\}([^`]+)`/);
    expect(match).toBeTruthy();
    const added = match![1]!;
    expect(added).not.toContain('organ_gland');
    expect(added).not.toContain('coach_topic');
    const readingLoader = source.slice(
      source.indexOf('export async function loadReadingContent'),
      source.indexOf('export async function loadCoachContent')
    );
    expect(readingLoader).not.toContain('fetchZones');
    expect(readingLoader).not.toContain('fetchPatterns');
    expect(readingLoader).not.toContain('fetchCoachingLibrary');
    expect(readingLoader).not.toContain("fetchCopy(supabase, 'coach')");
  });

  it('THE DATABASE REFUSES THEM TOO: no member select policy on the three practitioner tables', () => {
    const schema = fs.readFileSync(
      path.resolve(ROOT, '../../supabase/migrations/00000000000225_whole_body_signal_assessment.sql'),
      'utf8'
    );
    for (const table of [
      'whole_body_signal_zones',
      'whole_body_signal_patterns',
      'whole_body_signal_coaching_questions',
    ]) {
      expect(schema).not.toMatch(new RegExp(`authenticated_read_[a-z_]*\\s+on\\s+${table}\\b`));
      expect(schema).toMatch(new RegExp(`staff_read_[a-z_]*\\s+on\\s+${table}\\b`));
    }
  });
});

describe('2. the built object: no practitioner field can sit on it', () => {
  const { view } = buildRealView();
  const keys: string[] = [];
  const strings: { at: string; text: string }[] = [];
  walk(view, 'view', keys, strings);

  it('is a real view built from the real seeded content', () => {
    expect(view.cards.length).toBe(9);
    expect(view.groups.length).toBeGreaterThan(0);
  });

  it('holds no field named after a Zone, a chakra, an organ, a colour, a score or a percentage', () => {
    const leafNames = keys.map((key) => key.split('.').pop()!.replace(/\[\d+\]$/, ''));
    for (const field of PRACTITIONER_FIELDS) {
      expect(leafNames, `${field} is on the member view`).not.toContain(field);
    }
  });

  it('holds no practitioner WORD in any string it carries', () => {
    for (const { at, text } of strings) {
      for (const pattern of PRACTITIONER_WORDS) {
        expect(pattern.test(text), `${at} says "${text}"`).toBe(false);
      }
    }
  });

  it('holds no number formatted as a percentage or a score anywhere in it', () => {
    for (const { at, text } of strings) {
      expect(/\d+\s*%/.test(text), `${at} says "${text}"`).toBe(false);
      expect(/\b\d+\s*(of|out of)\s*\d+\b/i.test(text), `${at} says "${text}"`).toBe(false);
    }
  });

  it('draws bar length from the BAND STEP, which is the only number it carries', () => {
    for (const card of view.cards) {
      expect(card.bandStep).toBeGreaterThanOrEqual(1);
      expect(card.bandStep).toBeLessThanOrEqual(card.bandCount);
      expect(card.bandCount).toBe(BANDS.length);
    }
  });

  it('names one of the three plain intensity words on every bar', () => {
    for (const card of view.cards) {
      expect(['Mild', 'Moderate', 'Strong']).toContain(card.intensityWord);
    }
  });

  it('carries at most the stored maximum number of themes, in plain language', () => {
    const themes = new Set(QUESTIONS.map((question) => question.memberTheme));
    const coachTopics = new Set(QUESTIONS.map((question) => question.coachTopic));
    for (const card of view.cards) {
      expect(card.themes.length).toBeLessThanOrEqual(SETTINGS.maxMemberThemes);
      for (const theme of card.themes) {
        expect(themes.has(theme), `${theme} is not a stored member theme`).toBe(true);
        // A coach topic and a member theme are allowed to read the same
        // where the topic is already plain, so this only fails when a theme
        // is a topic that is NOT also a theme.
        if (!themes.has(theme)) expect(coachTopics.has(theme)).toBe(false);
      }
    }
  });
});

describe('3. the import graph: no member surface can reach the practitioner layer', () => {
  const BANNED = [
    'lib/whole-body-signal/patterns.ts',
    'lib/whole-body-signal/coachingQuestions.ts',
    'lib/whole-body-signal/coachView.ts',
  ];

  const MEMBER_SURFACES = [
    'app/whole-body-signal/page.tsx',
    'components/whole-body-signal/WholeBodySignalExperience.tsx',
    'components/whole-body-signal/WholeBodySignalResults.tsx',
    'components/whole-body-signal/WholeBodySignalEntry.tsx',
    'components/whole-body-signal/SectionMotion.tsx',
    'components/whole-body-signal/SignalReveal.tsx',
    'lib/whole-body-signal/memberView.ts',
    'lib/whole-body-signal/view.ts',
  ];

  /**
   * A MULTI-LINE IMPORT IS STILL AN IMPORT. A line by line regex misses
   * `import {\n  a,\n  b,\n} from '...'`, which is exactly how the long
   * import lists in this feature are written, so the whole file is matched
   * at once.
   */
  function importsOf(relative: string): string[] {
    const source = read(relative);
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);
    const resolved: string[] = [];
    for (const specifier of specifiers) {
      let base: string | null = null;
      if (specifier.startsWith('@/')) base = specifier.slice(2);
      else if (specifier.startsWith('.')) {
        base = path.normalize(path.join(path.dirname(relative), specifier));
      }
      if (!base) continue;
      for (const extension of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        const candidate = `${base}${extension}`;
        if (fs.existsSync(path.join(ROOT, candidate))) {
          resolved.push(candidate);
          break;
        }
      }
    }
    return resolved;
  }

  function reachableFrom(entry: string): Set<string> {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of importsOf(current)) queue.push(next);
    }
    return seen;
  }

  it('is following real files, so a typo in this list fails rather than passes silently', () => {
    for (const surface of MEMBER_SURFACES) {
      expect(fs.existsSync(path.join(ROOT, surface)), surface).toBe(true);
    }
    for (const banned of BANNED) {
      expect(fs.existsSync(path.join(ROOT, banned)), banned).toBe(true);
    }
  });

  it('cannot reach the pattern engine, the coaching library or the coach view from any of them', () => {
    for (const surface of MEMBER_SURFACES) {
      const reachable = reachableFrom(surface);
      for (const banned of BANNED) {
        expect(reachable.has(banned), `${surface} can reach ${banned}`).toBe(false);
      }
    }
  });

  it('the coach panel CAN reach them, so this guard is not vacuous', () => {
    const reachable = reachableFrom('app/coach/clients/[id]/WholeBodySignalPanel.tsx');
    for (const banned of BANNED) {
      expect(reachable.has(banned), `the coach panel cannot reach ${banned}`).toBe(true);
    }
  });
});

describe('4. the rendered screen: what she actually reads', () => {
  it('prints her section names, her bands and her themes, and no practitioner word', () => {
    const { view } = buildRealView();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <WholeBodySignalResults view={view} copy={MEMBER_COPY} action={<button>Return Home</button>} />
      );
    });

    const text = host.textContent ?? '';
    expect(text).toContain('Your Whole-Body Signal Picture');
    expect(text).toContain('Fuel Quality');

    for (const pattern of PRACTITIONER_WORDS) {
      expect(pattern.test(text), `the screen says something matching ${pattern}`).toBe(false);
    }
    expect(/\d+\s*%/.test(text), 'the screen prints a percentage').toBe(false);

    // And the serialised markup, not merely the visible text, because a
    // value left in an attribute is still in the page.
    const html = host.innerHTML;
    for (const zoneWord of ['chakra', 'Solar Plexus', 'Third Eye', 'Pineal']) {
      expect(html.includes(zoneWord), `the markup carries ${zoneWord}`).toBe(false);
    }

    act(() => root.unmount());
    host.remove();
  });

  it('says nothing is showing up strongly on a card that is not', () => {
    const { view } = buildRealView();
    const quiet = {
      ...view,
      cards: view.cards.map((card) => ({ ...card, isElevated: false })),
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(<WholeBodySignalResults view={quiet} copy={MEMBER_COPY} action={null} />);
    });

    // Open the first card.
    const buttons = [...host.querySelectorAll('button')];
    const card = buttons.find((button) => button.textContent?.includes('Fuel Quality'));
    expect(card).toBeTruthy();
    act(() => {
      card!.click();
    });

    expect(host.textContent).not.toContain('are showing up strongly right now');
    act(() => root.unmount());
    host.remove();
  });
});
