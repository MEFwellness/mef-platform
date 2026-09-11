/**
 * Permanent style law: the em dash character (—, U+2014) must never
 * appear in text a member or coach can read — UI strings, JSX text,
 * button labels, error messages returned to the UI, narrative/coaching
 * copy, etc. (2026-08-01 cleanup, see BUILD_STATUS.md). This guard walks
 * every source file under app/, components/, and lib/ with the real
 * TypeScript compiler API — so it inspects actual string/template/JSX
 * text nodes, never comments — and fails with the exact file:line of any
 * new violation, so the rule enforces itself on every future change
 * rather than relying on someone remembering to grep for it.
 *
 * A small, explicit, reviewed allowlist covers content that is
 * genuinely never rendered to a member or coach: LLM system/user prompt
 * strings (the model reads these, not the member — its own generated
 * reply is what the member sees, and that reply is separately guarded by
 * each prompt's own FORBIDDEN_PHRASES/safety re-check), and provider
 * registry metadata not wired to any UI today. Adding a file here is a
 * deliberate, reviewable exception, not a way to silence this guard.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib'];
const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

// Files whose only em dashes live inside LLM prompt strings or
// unused-by-any-UI provider-registry metadata — verified by hand during
// the 2026-08-01 sweep, not simply "test happened to pass."
const ALLOWLIST = new Set(
  [
    'lib/ai/dispatcher.ts',
    'lib/ai/providers/registry.ts',
    'lib/assessment-registry/registry.ts',
    'lib/body-assessment/postureMeasurements.ts',
    'lib/body-assessment/providers/registry.ts',
    'lib/coach-intelligence/providers/registry.ts',
    'lib/conversation-coach/prompt.ts',
    'lib/daily-checkin-adaptive/probeBank.ts',
    'lib/exercise-library/correctiveClassification.ts',
    'lib/food-lens/coachingNarrative.ts',
    'lib/food-lens/providers/anthropicVision.ts',
    'lib/food-lens/providers/labelOcr/anthropicLabelOcr.ts',
    'lib/food-lens/providers/labelOcr/registry.ts',
    'lib/food-lens/providers/registry.ts',
    'lib/food-products/coachingNarrative.ts',
    'lib/intelligence-core/service.ts',
    'lib/lead-capture/prompt.ts',
    'lib/restaurant/coachingNarrative.ts',
    'lib/restaurant/menuItemHeuristics.ts',
    'lib/your-move/matching.ts',
  ].map((p) => path.normalize(p))
);

function isConsoleCall(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      const obj = current.expression.expression;
      if (ts.isIdentifier(obj) && obj.text === 'console') return true;
    }
    current = current.parent;
  }
  return false;
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
}

type Violation = { file: string; line: number; text: string };

function findViolations(): Violation[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs)) walk(abs, files);
  }

  const violations: Violation[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (ALLOWLIST.has(path.normalize(rel))) continue;

    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(EM_DASH)) continue;

    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const visit = (node: ts.Node): void => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      ) {
        const nodeText = node.text;
        if (nodeText && nodeText.includes(EM_DASH) && !isConsoleCall(node)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          violations.push({
            file: rel,
            line: line + 1,
            text: nodeText.replace(/\s+/g, ' ').trim().slice(0, 120),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations;
}

/**
 * AND THE QUESTIONNAIRES, WHICH ARE JSON AND SO INVISIBLE TO THE SCAN ABOVE.
 *
 * A questionnaire is shipped as data (lib/assessments/<id>/questionnaire.json),
 * and everything a member reads while answering one lives in there: the
 * question text, the option labels, the context prompts and their helper
 * lines. The TypeScript compiler walk above cannot see a single word of it,
 * which is how four question texts sat on production carrying em dashes
 * while this guard reported clean. Found 2026-09-11 by driving the real
 * questionnaire and reading the screen.
 *
 * Only the member facing fields are checked. `source`, `notes` and the
 * verification record are provenance written for whoever maintains the
 * instrument, they are never rendered to anybody, and rewriting their
 * punctuation would damage a citation.
 */
function questionnaireViolations(): Violation[] {
  const dir = path.join(ROOT, 'lib/assessments');
  const out: Violation[] = [];
  if (!fs.existsSync(dir)) return out;

  const dashes = [EM_DASH, EN_DASH];
  const add = (file: string, where: string, text: unknown) => {
    if (typeof text !== 'string') return;
    if (!dashes.some((dash) => text.includes(dash))) return;
    out.push({ file, line: 0, text: `${where}: ${text.slice(0, 120)}` });
  };

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, 'questionnaire.json');
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(ROOT, file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      categories?: Array<{
        id?: string;
        name?: string;
        description?: string;
        questions?: Array<{ number?: number; text?: string; note?: string; options?: Array<{ label?: string }> }>;
      }>;
      contextQuestions?: Array<{ prompt?: string; helperText?: string; options?: Array<{ label?: string }> }>;
    };

    for (const category of data.categories ?? []) {
      add(rel, `category ${category.id} name`, category.name);
      add(rel, `category ${category.id} description`, category.description);
      for (const question of category.questions ?? []) {
        add(rel, `${category.id} q${question.number}`, question.text);
        add(rel, `${category.id} q${question.number} note`, question.note);
        for (const option of question.options ?? []) {
          add(rel, `${category.id} q${question.number} option`, option.label);
        }
      }
    }
    for (const context of data.contextQuestions ?? []) {
      add(rel, 'context prompt', context.prompt);
      add(rel, 'context helper', context.helperText);
      for (const option of context.options ?? []) add(rel, 'context option', option.label);
    }
  }

  return out;
}

describe('no em dash in user-facing text', () => {
  it('finds zero em dashes in app/components/lib string literals, template literals, and JSX text (outside the reviewed allowlist)', () => {
    const violations = findViolations();
    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}:${v.line}: "${v.text}"`).join('\n');
      throw new Error(
        `Found ${violations.length} em dash(es) in user-facing text. Replace each with a period, comma, colon, or parentheses, whichever reads best:\n${report}`
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('finds zero em or en dashes in anything a member reads inside a questionnaire', () => {
    const violations = questionnaireViolations();
    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}: "${v.text}"`).join('\n');
      throw new Error(
        `Found ${violations.length} dash(es) in questionnaire content a member reads. Replace each with a period, comma, colon, or parentheses:\n${report}`
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('is non vacuous: it really reads the shipped questionnaires', () => {
    const dir = path.join(ROOT, 'lib/assessments');
    const shipped = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(dir, entry.name, 'questionnaire.json')));
    expect(shipped.length).toBeGreaterThan(0);
  });
});
