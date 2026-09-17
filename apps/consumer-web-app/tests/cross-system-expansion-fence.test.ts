/**
 * THE FENCE, RE-WALKED FOR EVERY SURFACE THIS BUILD WIRED.
 *
 * WHY IT HAS TO BE RE-WALKED. Before this build exactly one member surface
 * could reach the classification pipeline: the daily check-in's notes
 * field. Seven more can now, including the Evening Reflection, the mid-day
 * concern flag, her messages to her coach and her intake. Each of those is
 * a NEW PATH from a member screen into a coach only feature, and each one
 * is a new chance for a coach facing sentence to be pulled along behind it
 * by an import nobody meant to add.
 *
 * WHAT IS ALLOWED THROUGH, and why it is not a hole. Classification and
 * the lookup run inside a member's own submit, by design: that is what
 * makes Root automatic. What makes it safe is that the modules on that
 * side of the fence hold NO COACH FACING SENTENCE AT ALL. They reach a
 * state and a set of row ids; the words live in files a member surface
 * cannot reach. That is asserted here rather than assumed.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  FINDING_HEADINGS,
  NOT_A_DIAGNOSIS,
  QUESTIONNAIRE_HEADING,
  RESOLUTION_SUFFIX,
  ROOT_NOTICED_LABEL,
  SAFETY_WITHHELD_BODY,
  SAFETY_WITHHELD_HEADING,
  STATE_EXPLANATIONS,
  STATE_LABELS,
  SUPERSEDED_ANSWER_LINE,
  TRACE_HEADING,
  TRACE_LEAD,
  TRACE_NO_SIGNAL,
} from '@/lib/cross-system-root/copy';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/** Every member entry point this build newly wired, plus the one that existed. */
const MEMBER_SURFACES = [
  'app/actions/checkin.ts',
  'app/actions/eveningReflection.ts',
  'app/actions/events.ts',
  'app/actions/conversation-coach.ts',
  'app/actions/healthIntake.ts',
  'app/checkin/CheckinForm.tsx',
  'app/checkin/evening/EveningReflectionForm.tsx',
  'components/checkin/ConcernFlag.tsx',
  'components/checkin/OptionalFollowUpNote.tsx',
  'components/health-intake/IntakeFieldView.tsx',
  'app/dashboard/page.tsx',
  // The Body Systems Survey, whose submit now also lets Root read the
  // sitting (tests/questionnaire-root-flow.test.ts). Her screens and the
  // action behind them.
  'app/actions/bodySystems.ts',
  'app/body-systems/page.tsx',
  'components/body-systems/BodySystemsExperience.tsx',
  'components/body-systems/BodySystemsResults.tsx',
];

/** The coach only half: the words, the cards and the library. */
const COACH_ONLY = [
  'lib/cross-system-root/copy.ts',
  'lib/cross-system-root/view.ts',
  'lib/cross-system-relationships/grouping.ts',
  'app/actions/crossSystemRootFindings.ts',
  'app/actions/crossSystemRelationships.ts',
  'app/coach/clients/[id]/RootNoticedPanel.tsx',
  'components/coach-relationships/RelationshipLibraryPanel.tsx',
  // What Root read from a survey, as a coach reads it, and the mapping
  // editor. None of it may be reachable from her survey screens.
  'lib/cross-system-root/noticedView.ts',
  'lib/cross-system-root/noticedRead.ts',
  'lib/cross-system-signals/coachView.ts',
  'lib/cross-system-signals/coachRead.ts',
  'lib/cross-system-signals/surveyMapping.ts',
  'app/actions/crossSystemSignalMappings.ts',
  'components/coach-signal-mappings/SurveySignalMappingPanel.tsx',
  'lib/body-systems/associations.ts',
];

/**
 * The half a member's own submit genuinely reaches, and must: her words
 * are classified as her check-in completes, and the lookup runs on the
 * rows that produced. Every file here is asserted wordless below.
 */
const REACHABLE_HALF = [
  'lib/cross-system-complaints/service.ts',
  'lib/cross-system-complaints/classify.ts',
  'lib/cross-system-complaints/data.ts',
  'lib/cross-system-complaints/lexiconData.ts',
  'lib/cross-system-complaints/constants.ts',
  'lib/cross-system-complaints/types.ts',
  'lib/cross-system-root/engine.ts',
  'lib/cross-system-root/lookup.ts',
  'lib/cross-system-root/evidence.ts',
  'lib/cross-system-root/types.ts',
  /*
    THE WRITE PATH IS ON THIS SIDE, and it has to be: a finding is stored
    as her check-in completes, so the insert runs inside her submit. It is
    rows and column names, it imports neither the copy nor the view, and
    the word scan below reads it along with everything else.
  */
  'lib/cross-system-root/data.ts',
  /*
    AND THE MAP'S OWN READ, for the same reason: the lookup has to load the
    Association Map to consult it, and the lookup runs inside her submit.
    It reads rows and builds summaries; the wording a coach sees is built
    later, in files this list does not contain.
  */
  'lib/cross-system-relationships/data.ts',
  'lib/cross-system-relationships/types.ts',
  /*
    AND THE SURVEY'S TURN AT THE SAME LOOKUP. Her finished sitting is read
    by Root inside her own submit, so the engine that does it, the survey
    rule it applies and the wordless trigger evaluation behind that rule are
    on this side. They reach a basis key and a set of row ids; every word a
    coach reads about them is built in noticedView.ts and copy.ts, which the
    first list above holds out of reach.
  */
  'lib/cross-system-root/questionnaireEngine.ts',
  'lib/cross-system-signals/questionnaireRules.ts',
  'lib/cross-system-signals/questionnaireState.ts',
  'lib/cross-system-signals/questionnaireFacts.ts',
  'lib/body-systems/triggerEvaluation.ts',
];

/**
 * The modules a file really pulls in at runtime.
 *
 * A TYPE ONLY IMPORT SHIPS NOTHING, and counting one as reachability makes
 * this guard wrong in the direction that matters least but is still wrong:
 * it would report a leak where TypeScript has erased the import entirely
 * before a single byte is sent. `import type { X } from './y'` is a
 * compile time fact about a shape, and the only fix for a guard that fails
 * on one is to stop using types.
 */
function importsOf(relative: string): string[] {
  const source = read(relative);
  const specifiers: string[] = [];
  for (const statement of source.matchAll(/import\s+([\s\S]*?)from\s+['"]([^'"]+)['"]/g)) {
    const clause = statement[1]!;
    // The whole clause is a type import, so nothing survives compilation.
    if (/^\s*type\s/.test(clause)) continue;
    specifiers.push(statement[2]!);
  }
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

/** Every string a file can actually ship, read with the compiler. */
function renderedStrings(relative: string): string[] {
  const sourceFile = ts.createSourceFile(
    relative,
    read(relative),
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: string[] = [];
  const walk = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push(node.text);
    }
    node.forEachChild(walk);
  };
  walk(sourceFile);
  return out;
}

describe('the lists are real, so a typo fails rather than passes silently', () => {
  it.each([...MEMBER_SURFACES, ...COACH_ONLY, ...REACHABLE_HALF])('%s exists', (file) => {
    expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
  });
});

describe('no member surface can reach the coach only half', () => {
  it.each(MEMBER_SURFACES)('%s reaches none of the words, the cards or the library', (surface) => {
    const reachable = reachableFrom(surface);
    for (const file of COACH_ONLY) {
      expect(reachable.has(file), `${surface} can reach ${file}`).toBe(false);
    }
  });

  it('and reaches nothing of this feature except the half it is allowed to', () => {
    for (const surface of MEMBER_SURFACES) {
      for (const file of reachableFrom(surface)) {
        if (
          !file.startsWith('lib/cross-system-complaints/') &&
          !file.startsWith('lib/cross-system-root/') &&
          !file.startsWith('lib/cross-system-relationships/')
        ) {
          continue;
        }
        expect(REACHABLE_HALF, `${surface} reaches ${file}`).toContain(file);
      }
    }
  });
});

describe('NOT ONE WORD A COACH READS is reachable from a member surface', () => {
  /**
   * ONLY THE SENTENCES, and the reason is worth writing down. Three of the
   * evidence state LABELS are single words that are also the state's own
   * machine value: the enum in lib/cross-system-root/evidence.ts really
   * does hold 'current', 'recent' and 'historical', and it has to, because
   * that is what the column stores. A guard that failed on those would be
   * failing on a column name rather than on a word a coach reads, and the
   * only way to pass it would be to rename the data. So this list is the
   * phrases: every one of them is something written FOR a coach to read.
   */
  const COACH_FACING = [
    ROOT_NOTICED_LABEL,
    NOT_A_DIAGNOSIS,
    SAFETY_WITHHELD_HEADING,
    SAFETY_WITHHELD_BODY,
    RESOLUTION_SUFFIX,
    ...Object.values(FINDING_HEADINGS),
    ...Object.values(STATE_LABELS),
    ...Object.values(STATE_EXPLANATIONS),
    'Whole-Body Association Map',
    'Areas Root checked',
    'Possible Association',
    'Coaching Considerations',
    'worth reviewing',
    'may be relevant',
    'observed alongside',
    QUESTIONNAIRE_HEADING,
    TRACE_HEADING,
    TRACE_LEAD,
    SUPERSEDED_ANSWER_LINE,
    ...Object.values(TRACE_NO_SIGNAL),
    'currently supports:',
    'currently supported by',
    'Active: answered',
    'Not active: answered',
    'strongly elevated',
    'Led Root to',
  ].filter((phrase) => phrase.includes(' '));

  it('every file a member surface can reach ships none of them', () => {
    const reachable = new Set<string>();
    for (const surface of MEMBER_SURFACES) {
      for (const file of reachableFrom(surface)) {
        if (
          file.startsWith('lib/cross-system-complaints/') ||
          file.startsWith('lib/cross-system-root/') ||
          file.startsWith('lib/cross-system-relationships/') ||
          file.startsWith('lib/cross-system-signals/') ||
          file === 'lib/body-systems/triggerEvaluation.ts'
        ) {
          reachable.add(file);
        }
      }
    }
    expect(reachable.size).toBeGreaterThan(0);

    for (const file of reachable) {
      const strings = renderedStrings(file).map((value) => value.toLowerCase());
      for (const phrase of COACH_FACING) {
        const needle = phrase.toLowerCase();
        const hit = strings.find((value) => value.includes(needle));
        expect(hit, `${file} ships coach facing wording: "${phrase}"`).toBeUndefined();
      }
    }
  });

  it('is not vacuous: the coach only half really does ship those strings', () => {
    const coachStrings = ['lib/cross-system-root/copy.ts', 'lib/cross-system-root/view.ts']
      .flatMap(renderedStrings)
      .join('\n');
    for (const phrase of [ROOT_NOTICED_LABEL, NOT_A_DIAGNOSIS, RESOLUTION_SUFFIX, QUESTIONNAIRE_HEADING, 'currently supports:', 'Not active: answered']) {
      expect(coachStrings, phrase).toContain(phrase);
    }
  });
});

describe('the one member facing thing this build added says nothing about any of it', () => {
  it('the optional box is a label and a placeholder, and nothing else', () => {
    const strings = renderedStrings('components/checkin/OptionalFollowUpNote.tsx');
    for (const value of strings) {
      expect(value.toLowerCase()).not.toContain('root');
      expect(value.toLowerCase()).not.toContain('signal');
      expect(value.toLowerCase()).not.toContain('pattern');
      expect(value.toLowerCase()).not.toContain('association');
      expect(value).not.toContain('—');
    }
  });

  it('the check-in form never tells her what happens to what she typed', () => {
    const strings = renderedStrings('app/checkin/CheckinForm.tsx').map((value) =>
      value.toLowerCase()
    );
    for (const phrase of [
      'association map',
      'root noticed',
      'whole-body pattern',
      'coaching consideration',
      'possible association',
    ]) {
      expect(strings.find((value) => value.includes(phrase)), phrase).toBeUndefined();
    }
  });
});

describe('the red flag override still wins, and from every surface', () => {
  it('the lookup applies it before it builds anything, so nothing is written then hidden', () => {
    const engine = read('lib/cross-system-root/engine.ts');
    expect(engine).toContain("from '@/lib/cross-system-patterns/safety'");
    expect(engine).toContain('redFlaggedSignalIds');
    // Resolved BEFORE the lookup runs, not after.
    const flaggedAt = engine.indexOf('const flaggedSignals');
    const lookupAt = engine.indexOf('lookupForComplaint(');
    expect(flaggedAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeGreaterThan(flaggedAt);
  });

  it('one flagged row withholds the WHOLE finding, whichever surface it came from', () => {
    const lookup = read('lib/cross-system-root/lookup.ts');
    expect(lookup).toContain('redFlaggedSignalIds');
    expect(lookup).toContain('safetyWithheld: withheld.length > 0');
  });

  it('a withheld finding is built empty rather than drawn empty', () => {
    expect(read('lib/cross-system-root/data.ts')).toContain(
      'A WITHHELD FINDING STORES NO AREAS AND NO ROWS'
    );
    expect(read('lib/cross-system-root/view.ts')).toContain('suppressed: true');
  });

  it('every surface goes through the one engine, so none of them can skip it', () => {
    // hearComplaints calls ingestComplaint calls runComplaintLookup. There
    // is no second path into the findings table.
    const service = read('lib/cross-system-complaints/service.ts');
    expect(service).toContain('runComplaintLookup');
    expect(
      (read('lib/cross-system-root/data.ts').match(/from\('cross_system_root_findings'\)\s*\n?\s*\.insert/g) ?? [])
        .length
    ).toBe(1);
  });

  it('the safety module a member surface reaches still holds no coach sentence', () => {
    const strings = renderedStrings('lib/cross-system-patterns/safety.ts');
    for (const value of strings) {
      expect(value.toLowerCase()).not.toContain('worth reviewing');
      expect(value.toLowerCase()).not.toContain('association');
    }
  });
});
