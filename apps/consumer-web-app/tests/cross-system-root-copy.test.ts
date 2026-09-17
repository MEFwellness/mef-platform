/**
 * EVERY STRING THE ROOT NOTICED SURFACE CAN SHOW, held to the Relationship
 * Library's own banned list.
 *
 * It reuses that list rather than defining a second one, because two lists
 * would eventually disagree and the weaker one would win.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { findBannedLanguage } from '@/lib/cross-system-relationships/language';
import {
  EMPTY_BODY,
  EMPTY_HEADING,
  NOT_A_DIAGNOSIS,
  SAFETY_WITHHELD_BODY,
  STATE_EXPLANATIONS,
  STATE_LABELS,
  basisLine,
  convergenceLine,
  noticedLine,
  proactiveLine,
  summaryLine,
  whyCheckedLine,
} from '@/lib/cross-system-root/copy';
import { CURRENT_WINDOW_DAYS, RECENT_WINDOW_DAYS } from '@/lib/cross-system-root/evidence';
import { patternsDigest, rootNoticedDigest } from '@/lib/coach-detail/digests';

const ROOT = path.resolve(__dirname, '..');

const FEATURE_FILES = [
  'lib/cross-system-root/copy.ts',
  'lib/cross-system-root/view.ts',
  'lib/cross-system-root/lookup.ts',
  'lib/cross-system-root/evidence.ts',
  'lib/cross-system-root/types.ts',
  'lib/cross-system-root/data.ts',
  'lib/cross-system-root/engine.ts',
  'lib/cross-system-complaints/classify.ts',
  'lib/cross-system-complaints/constants.ts',
  'lib/cross-system-complaints/data.ts',
  'lib/cross-system-complaints/service.ts',
  'lib/cross-system-complaints/types.ts',
  'app/coach/clients/[id]/RootNoticedPanel.tsx',
  'app/actions/crossSystemRootFindings.ts',
  // What Root reads from a Body Systems Survey, and every line a coach
  // reads about it: the survey block, the trace, the Signals section's
  // state and support lines, and the mapping editor.
  'lib/cross-system-root/noticedView.ts',
  'lib/cross-system-root/noticedRead.ts',
  'lib/cross-system-root/questionnaireEngine.ts',
  'lib/cross-system-root/questionnaireBackfill.ts',
  'lib/cross-system-signals/questionnaireRules.ts',
  'lib/cross-system-signals/questionnaireState.ts',
  'lib/cross-system-signals/coachView.ts',
  'lib/cross-system-signals/surveyMapping.ts',
  'lib/cross-system-signals/surveyMappingData.ts',
  'app/coach/clients/[id]/CrossSystemSignalsPanel.tsx',
  'app/actions/crossSystemSignalMappings.ts',
  'app/coach/signal-mappings/page.tsx',
  'components/coach-signal-mappings/SurveySignalMappingPanel.tsx',
  // The coach briefing: its rules, its builder, its store, and the two
  // components that draw it and the evidence behind it.
  'lib/cross-system-root/briefing.ts',
  'lib/cross-system-root/briefingRules.ts',
  'lib/cross-system-root/briefingData.ts',
  'app/coach/clients/[id]/RootBriefing.tsx',
  'app/coach/clients/[id]/RootNoticedEvidence.tsx',
];

/**
 * Every string and JSX text node in a file, read with the real TypeScript
 * compiler so a comment is never mistaken for copy.
 */
function renderedStrings(file: string): Array<{ line: number; text: string }> {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: Array<{ line: number; text: string }> = [];

  function visit(node: ts.Node): void {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const text = node.text.trim();
      if (text.length > 0) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        out.push({ line: line + 1, text });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return out;
}

describe('the Root Noticed copy writes in association language', () => {
  it('is non vacuous: it really reads these files and finds strings in them', () => {
    for (const file of FEATURE_FILES) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(true);
    }
    const strings = FEATURE_FILES.flatMap((file) => renderedStrings(file));
    expect(strings.length).toBeGreaterThan(100);
  });

  /**
   * ONE EXEMPTION, AND ONLY THIS ONE.
   *
   * The standing disclaimer says "Root does not diagnose". The banned list
   * matches "diagnosis" with its inflections, so it catches the word inside
   * the one sentence whose entire job is to DENY the thing. A sentence that
   * refuses a claim has to be able to name it, which is the same reason the
   * Relationship Library's own lint exempts its banned-list file and the
   * warning that quotes a phrase back.
   *
   * It is pinned to the exact constant rather than to a pattern, so nothing
   * else can drift into the exemption: a second sentence that wanted to use
   * the word would fail this test.
   */
  const ALLOWED_DENIAL = NOT_A_DIAGNOSIS;

  it('carries no banned phrase in any string this feature renders', () => {
    const violations: string[] = [];
    for (const file of FEATURE_FILES) {
      for (const entry of renderedStrings(file)) {
        if (entry.text === ALLOWED_DENIAL) continue;
        for (const hit of findBannedLanguage(entry.text)) {
          violations.push(`${file}:${entry.line}: "${hit.phrase}" in "${entry.text.slice(0, 120)}"`);
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  it('the one exemption is a denial, and there is exactly one of it', () => {
    // If this ever stops being a denial, the exemption stops being
    // justified and this test is what says so.
    expect(ALLOWED_DENIAL).toMatch(/does not diagnose/);
    const uses = FEATURE_FILES.flatMap((file) => renderedStrings(file)).filter(
      (entry) => entry.text === ALLOWED_DENIAL
    );
    expect(uses).toHaveLength(1);
  });

  it('carries no em dash anywhere a coach reads', () => {
    const offenders: string[] = [];
    for (const file of FEATURE_FILES) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (source.includes('—')) offenders.push(file);
    }
    expect(offenders, offenders.join('\n')).toHaveLength(0);
  });
});

describe('what the sentences actually say', () => {
  it('never says an area produced the complaint', () => {
    const line = whyCheckedLine('Hip and pelvis signals', 'Kidney/Bladder');
    expect(line).toContain('may be worth reviewing');
    expect(findBannedLanguage(line)).toHaveLength(0);
  });

  it('names the map as the reason it looked, not her body', () => {
    expect(whyCheckedLine('A pattern', 'Stress')).toContain(
      'Whole-Body Association Map'
    );
  });

  it('a counted claim always names the window it counted', () => {
    expect(STATE_EXPLANATIONS.current).toContain(String(CURRENT_WINDOW_DAYS));
    expect(STATE_EXPLANATIONS.recent).toContain(String(RECENT_WINDOW_DAYS));
    expect(STATE_EXPLANATIONS.historical).toContain(String(RECENT_WINDOW_DAYS));
  });

  it('keeps the five evidence states apart in words as well as in the data', () => {
    const labels = Object.values(STATE_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    expect(STATE_LABELS.resolved).not.toBe(STATE_LABELS.current);
    expect(STATE_LABELS.not_observed).toContain('Not currently observed');
  });

  it('agrees with its own count, in both halves of the sentence', () => {
    const one = summaryLine({ areaCount: 1, currentCount: 1, notObservedCount: 0 });
    expect(one).toContain('1 area.');
    expect(one).toContain('has something');
    expect(one).not.toContain('1 areas');
    expect(one).not.toContain('1 of them have');

    const many = summaryLine({ areaCount: 9, currentCount: 3, notObservedCount: 6 });
    expect(many).toContain('9 areas');
    expect(many).toContain('3 of them have');
  });

  it('says plainly when nothing was found, rather than saying nothing', () => {
    expect(summaryLine({ areaCount: 9, currentCount: 0, notObservedCount: 9 })).toContain(
      'nothing currently reported'
    );
  });

  it('a convergence is counted, never concluded from', () => {
    const line = convergenceLine('Digestion', 3);
    expect(line).toContain('overlap');
    expect(line).toContain('3 separate reports');
    expect(line).not.toMatch(/proves|dysfunction|because of/i);
  });

  it('the proactive line agrees with its own number', () => {
    expect(proactiveLine(1)).toBe('1 new whole-body connection may be worth reviewing.');
    expect(proactiveLine(3)).toContain('3 new whole-body connections');
  });

  it('states the basis rather than implying it, for every source type', () => {
    for (const key of [
      'chek_hlc',
      'referred_pain',
      'biomechanics',
      'lifestyle',
      'mef_internal',
      'coach_added',
      'other',
    ]) {
      const line = basisLine(key);
      expect(line.length).toBeGreaterThan(10);
      expect(findBannedLanguage(line)).toHaveLength(0);
    }
    expect(basisLine('chek_hlc')).toContain('not an established medical finding');
  });

  it('an unknown source type falls back rather than printing its own key', () => {
    expect(basisLine('something-nobody-defined')).toBe(basisLine('other'));
  });

  it('every card says in words that it is not a diagnosis', () => {
    expect(NOT_A_DIAGNOSIS).toContain('does not diagnose');
    expect(NOT_A_DIAGNOSIS).toContain('none of the areas above is being named as the reason');
  });

  it('the safety prompt points at the existing process rather than describing one', () => {
    expect(SAFETY_WITHHELD_BODY).toContain('red flag');
    expect(SAFETY_WITHHELD_BODY).toContain('Body Systems Survey');
  });

  it('the empty state says what is true rather than offering to fill itself', () => {
    expect(EMPTY_HEADING).toBe('Nothing to review');
    expect(EMPTY_BODY).toContain('automatically');
    expect(EMPTY_BODY).not.toMatch(/create a pattern|build a relationship/i);
  });

  it('the opening line says what Root did, not what it concluded', () => {
    expect(noticedLine()).toContain('checked');
    expect(findBannedLanguage(noticedLine())).toHaveLength(0);
  });
});

describe('the banned list really would catch this feature', () => {
  it('is non vacuous: a diagnostic sentence in this shape is rejected', () => {
    const bad = 'Kidney dysfunction is the cause of the hip pain.';
    expect(findBannedLanguage(bad).length).toBeGreaterThan(0);
  });
});

/**
 * THE FOLDED SECTION HEADER, which the live run corrected.
 *
 * The shared `plural` helper appends an "s" to whatever it is handed, which
 * is right for a noun and wrong for a phrase. On production the Root
 * Noticed header read "2 connection to reviews", and the Whole-Body
 * Patterns header had been reading "2 pattern to reviews" since Prompt 3
 * shipped. Both are fixed, and both are held here.
 */
describe('the folded section headers agree with their own counts', () => {
  it('Root Noticed pluralizes the phrase, not its last word', () => {
    expect(rootNoticedDigest({ findings: 1, suppressed: 0, complaints: 1, mapEntries: 18 }).text).toBe(
      '1 connection to review'
    );
    expect(rootNoticedDigest({ findings: 2, suppressed: 0, complaints: 1, mapEntries: 18 }).text).toBe(
      '2 connections to review'
    );
  });

  it('Whole-Body Patterns does too, which it did not before', () => {
    expect(patternsDigest({ patterns: 1, suppressed: 0, activeRelationships: 3 }).text).toBe(
      '1 pattern to review'
    );
    expect(patternsDigest({ patterns: 4, suppressed: 0, activeRelationships: 9 }).text).toBe(
      '4 patterns to review'
    );
  });

  it('no header ever prints a phrase with a trailing s on the wrong word', () => {
    const texts = [
      rootNoticedDigest({ findings: 3, suppressed: 0, complaints: 2, mapEntries: 18 }).text,
      patternsDigest({ patterns: 3, suppressed: 0, activeRelationships: 4 }).text,
    ];
    for (const text of texts) expect(text).not.toMatch(/to reviews/);
  });

  it('a count of findings is never coloured as an alarm', () => {
    // A finding is a thing to review, not a thing asking for anything.
    // Only the safety case is gold, everywhere on this page.
    expect(rootNoticedDigest({ findings: 5, suppressed: 0, complaints: 3, mapEntries: 18 }).dot).toBe(
      'green'
    );
    expect(rootNoticedDigest({ findings: 0, suppressed: 0, complaints: 0, mapEntries: 18 }).dot).toBe(
      'grey'
    );
    expect(rootNoticedDigest({ findings: 1, suppressed: 2, complaints: 3, mapEntries: 18 }).dot).toBe(
      'gold'
    );
  });

  it('an empty section says WHY it is empty', () => {
    expect(
      rootNoticedDigest({ findings: 0, suppressed: 0, complaints: 0, mapEntries: 0 }).text
    ).toBe('No association map entry is active yet');
    expect(
      rootNoticedDigest({ findings: 0, suppressed: 0, complaints: 0, mapEntries: 18 }).text
    ).toBe('Nothing reported yet');
    expect(
      rootNoticedDigest({ findings: 0, suppressed: 0, complaints: 4, mapEntries: 18 }).text
    ).toBe('Nothing to review');
  });
});
