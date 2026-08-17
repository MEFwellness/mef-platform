/**
 * The Naming Standard, enforced.
 *
 * docs/NAMING-STANDARD.md is the prose, lib/naming/standard.ts is the rule,
 * and this file is what stops the rule from being decorative.
 *
 * Two halves:
 *
 *   THE RETIRED NAMES. Every clinical name this app used to show is listed
 *   in BANNED_NAMES, and this walks the whole of app/, components/ and lib/
 *   looking for any of them in a string literal. This is the check that
 *   catches a rename that landed in four places out of five.
 *
 *   THE LIVE NAMES. Every name in every map the app renders from is run
 *   through checkNamingStandard, so a NEW clinical name cannot be added
 *   either. Being clean today is not the same as staying clean.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  ALL_BANNED_NAME_WORDS,
  BANNED_NAMES,
  NAMES_PENDING_DECISION,
  checkNamingStandard,
  meetsNamingStandard,
} from '../lib/naming/standard';
import { FINDING_DISPLAY_NAMES, POSTURE_MEMBER_NAMES, findingDisplayName } from '../lib/naming/findingNames';
import { PLAIN_DOMAIN_NAMES, coachingDomainLabel } from '../lib/naming/domainNames';
import { WBSA_RETIRED_SECTION_TITLES, WBSA_SECTION_TITLES } from '../lib/wbsa/constants';
import { CONCERN_CATEGORIES } from '../lib/safety/categories';
import { COACHING_DOMAINS } from '../lib/investigation-engine/domains';
import { UNBUILT_PLACEHOLDER_LABEL } from '../lib/naming/unbuiltPlaceholders';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib'];

/**
 * The two files that legitimately hold the retired names as DATA: the
 * banned list itself, and the one place the old Whole-Body Check-In titles
 * are kept so the migration can rename by exact match. Everywhere else, a
 * retired name in a string literal is a rename that did not land.
 *
 * Comments are not scanned, deliberately. The rename tables carry the old
 * wording beside each new name ("was Gut Fungal & Parasite Concerns"),
 * which is what makes them auditable six months later, and a check that
 * forced those comments out would be trading real documentation for a
 * clean grep.
 */
const ALLOWED_FILES = new Set(['lib/naming/standard.ts', 'lib/wbsa/constants.ts']);

/** Every string literal, template chunk and JSX text node in one file. */
function renderedStrings(file: string, contents: string): { text: string; line: number }[] {
  const sourceFile = ts.createSourceFile(
    file,
    contents,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: { text: string; line: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      if (node.text) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        out.push({ text: node.text, line: line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_FILES = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));

describe('no retired clinical name renders anywhere', () => {
  it('finds none of the retired names in any source file outside the rename tables', () => {
    const violations: string[] = [];

    for (const file of SOURCE_FILES) {
      const relative = path.relative(ROOT, file);
      if (ALLOWED_FILES.has(relative)) continue;
      const contents = fs.readFileSync(file, 'utf8');
      if (!BANNED_NAMES.some((banned) => contents.includes(banned))) continue;

      for (const { text, line } of renderedStrings(file, contents)) {
        for (const banned of BANNED_NAMES) {
          if (text.includes(banned)) violations.push(`${relative}:${line}: "${banned}"`);
        }
      }
    }

    expect(violations, `Retired clinical names still in the source:\n${violations.join('\n')}`).toEqual([]);
  });

  it('lists every name the audit flagged, so the list cannot silently shrink', () => {
    for (const name of [
      'Gut Fungal & Parasite Concerns',
      'Adrenal & Stress-Response Patterns',
      'Movement Deficiency',
      'Detoxification Load Concerns',
      'Circadian Rhythm Disruption',
      'Elevated Stress',
      'Poor Sleep Quality',
      'Low Energy',
      'Digestive Complaints',
      'Nutrient Insufficiency Patterns',
      'Thyroid & Metabolic-Related Observations',
      'Liver & Detoxification Support',
      'Immune & Inflammatory Patterns',
      'Kidney, Bladder & Fluid-Balance Patterns',
    ]) {
      expect(BANNED_NAMES).toContain(name);
    }
  });

  it('every retired Whole-Body Check-In section title is on the banned list', () => {
    for (const title of WBSA_RETIRED_SECTION_TITLES) {
      expect(BANNED_NAMES).toContain(title);
    }
  });
});

describe('checkNamingStandard', () => {
  it('rejects a condition word', () => {
    expect(meetsNamingStandard('Circadian Rhythm Disruption')).toBe(false);
  });

  it('rejects a pathogen word', () => {
    expect(checkNamingStandard('Gut fungal concerns').some((v) => v.rule === 'pathogen')).toBe(true);
  });

  it('rejects an organ word', () => {
    expect(checkNamingStandard('Adrenal patterns').some((v) => v.rule === 'organ')).toBe(true);
  });

  it('rejects an em dash', () => {
    const emDash = String.fromCharCode(0x2014);
    expect(meetsNamingStandard(`Sleep ${emDash} how it went`)).toBe(false);
  });

  it('rejects an en dash too, since it reads the same way in a heading', () => {
    const enDash = String.fromCharCode(0x2013);
    expect(meetsNamingStandard(`Sleep ${enDash} how it went`)).toBe(false);
  });

  it('accepts a plain, experience-first name', () => {
    expect(meetsNamingStandard('Sleep that has not been leaving you rested')).toBe(true);
    expect(meetsNamingStandard('Bloating, cravings and gut discomfort')).toBe(true);
  });

  it('matches whole words only, so a longer word containing a short banned one is not caught by accident', () => {
    // 'detox' is banned; 'detoxes' would be a whole-word variant and is not
    // in the list, but 'Redetoxification' must not be flagged as if it were
    // the standalone word.
    expect(checkNamingStandard('Windetox')).toEqual([]);
  });

  it('the banned word list is non-trivial', () => {
    expect(ALL_BANNED_NAME_WORDS.length).toBeGreaterThan(40);
  });
});

describe('every live name meets the standard', () => {
  it('every finding display name', () => {
    for (const [key, name] of Object.entries(FINDING_DISPLAY_NAMES)) {
      expect(checkNamingStandard(name), `${key} -> "${name}"`).toEqual([]);
    }
  });

  it('every posture finding name a member can read', () => {
    for (const [key, name] of Object.entries(POSTURE_MEMBER_NAMES)) {
      expect(checkNamingStandard(name), `${key} -> "${name}"`).toEqual([]);
    }
  });

  it('every Whole-Body Check-In section title', () => {
    for (const title of WBSA_SECTION_TITLES) {
      expect(checkNamingStandard(title), title).toEqual([]);
    }
  });

  it('the plain domain name set, which is one half of an undecided question and must be finished copy either way', () => {
    for (const [domain, name] of Object.entries(PLAIN_DOMAIN_NAMES)) {
      expect(checkNamingStandard(name), `${domain} -> "${name}"`).toEqual([]);
    }
  });

  it('every safety concern category label, which is the one screen where wording matters most', () => {
    for (const category of CONCERN_CATEGORIES) {
      // Safety categories legitimately name symptoms a clinician would name,
      // because they exist to route a person to one. What they may not do is
      // carry an em dash or a retired name.
      const emDash = String.fromCharCode(0x2014);
      expect(category.label).not.toContain(emDash);
      for (const banned of BANNED_NAMES) expect(category.label).not.toContain(banned);
    }
  });

  it('the unbuilt placeholder wording is not a promise', () => {
    expect(UNBUILT_PLACEHOLDER_LABEL.toLowerCase()).not.toContain('soon');
  });
});

describe('the three judgment items are exactly three, and named', () => {
  it('has three, no more', () => {
    expect(NAMES_PENDING_DECISION).toHaveLength(3);
  });

  it('names the three the report asks about', () => {
    expect([...NAMES_PENDING_DECISION].sort()).toEqual([
      'coaching_domain_labels',
      'movement_score',
      'unbuilt_placeholders',
    ]);
  });

  it('the coaching domain labels are still the shared taxonomy, so the decision genuinely has not been made', () => {
    expect(coachingDomainLabel('pain_structural_integrity')).toBe(
      COACHING_DOMAINS.find((d) => d.domain === 'pain_structural_integrity')!.label
    );
  });
});

describe('findingDisplayName', () => {
  it('names a finding from its stable key, ignoring whatever the row was stored with', () => {
    expect(findingDisplayName('stress', 'elevated_stress', 'Elevated Stress')).toBe(
      'The stress you are carrying'
    );
  });

  it('never returns a retired name, even when the stored row still carries one', () => {
    for (const [key, oldName] of [
      ['nutrition::gut_fungal_parasite_concern', 'Gut Fungal & Parasite Concerns'],
      ['movement::movement_deficiency', 'Movement Deficiency'],
      ['sleep::poor_sleep_quality', 'Poor Sleep Quality'],
    ] as const) {
      const [domain, code] = key.split('::');
      expect(findingDisplayName(domain!, code!, oldName)).not.toBe(oldName);
    }
  });

  it('humanizes a raw enum that escaped an adapter rather than printing it', () => {
    expect(findingDisplayName('movement', 'unknown_code', 'thoracic_kyphosis')).toBe(
      'Thoracic kyphosis'
    );
  });

  it('renames a posture finding for the member rather than printing the enum', () => {
    expect(findingDisplayName('posture', 'thoracic_kyphosis')).toBe(
      'Rounding through your upper back'
    );
  });

  it('falls back to the code itself when there is nothing else, and never to an empty string', () => {
    expect(findingDisplayName('lab', 'some_new_code')).toBe('Some new code');
  });
});
