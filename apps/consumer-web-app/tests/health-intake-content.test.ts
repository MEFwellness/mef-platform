/**
 * The Health & Lifestyle Intake's content, held to its own rules.
 *
 * WHY THESE TESTS EXIST. The instrument is a typed constant rather than a
 * table of rows (see lib/health-intake/types.ts's header for why), so the
 * thing that keeps it honest is a test reading the same constant the app
 * serves. Every rule below is one the brief actually set, asserted against
 * the real content rather than against a copy of it.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  INTAKE_SECTIONS,
  INTAKE_SECTION_COUNT,
  SYMPTOM_OPTIONS,
  WORSENING_SYMPTOMS,
  allFields,
  allScreens,
  optionLabel,
} from '@/lib/health-intake/questions';
import { HLI_COPY, FORBIDDEN_DIAGNOSIS_OPENINGS } from '@/lib/health-intake/copy';
import { HLI_DEFINITION_ID, HLI_KEY, HLI_LABEL, HLI_ROUTE } from '@/lib/health-intake/constants';
import { isGateScreen } from '@/lib/health-intake/steps';

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.resolve(
  ROOT,
  '../../supabase/migrations/00000000000230_health_lifestyle_intake.sql'
);

/** Every file this feature owns, so a punctuation sweep covers all of it. */
function featureFiles(): string[] {
  const dirs = [
    path.join(ROOT, 'lib/health-intake'),
    path.join(ROOT, 'components/health-intake'),
    path.join(ROOT, 'app/health-intake'),
  ];
  const out: string[] = [];
  for (const dir of dirs) {
    for (const entry of fs.readdirSync(dir)) out.push(path.join(dir, entry));
  }
  out.push(path.join(ROOT, 'app/actions/healthIntake.ts'));
  out.push(MIGRATION);
  return out;
}

/** Every string a member or a coach could read, gathered from the content itself. */
function everyContentString(): string[] {
  const strings: string[] = [];
  for (const section of INTAKE_SECTIONS) {
    strings.push(section.title, section.framingLine);
    if (section.transitionLine) strings.push(section.transitionLine);
    for (const screen of section.screens) {
      if (screen.title) strings.push(screen.title);
      if (screen.note) strings.push(screen.note);
      for (const field of screen.fields) {
        strings.push(field.label);
        if ('help' in field && field.help) strings.push(field.help);
        if ('placeholder' in field && field.placeholder) strings.push(field.placeholder);
        if ('options' in field) for (const option of field.options) strings.push(option.label);
        if (field.kind === 'entry_list') {
          strings.push(field.addLabel, field.addAnotherLabel, field.noun.one, field.noun.many);
          for (const entryField of field.entryFields) {
            strings.push(entryField.label);
            if (entryField.kind === 'text' && entryField.placeholder) {
              strings.push(entryField.placeholder);
            }
            if (entryField.kind === 'select') {
              for (const option of entryField.options) strings.push(option.label);
            }
          }
        }
        if (field.kind === 'scale_ten') strings.push(field.lowLabel, field.highLabel);
      }
    }
  }
  strings.push(...Object.values(HLI_COPY));
  return strings;
}

describe('the instrument is addressed the same way everywhere', () => {
  it('the fixed id in code is the fixed id in the migration', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain(HLI_DEFINITION_ID);
    expect(sql).toContain(HLI_KEY);
    expect(sql).toContain(HLI_LABEL);
  });

  it('the route the pop-up, the card and the staff redirect all name is one string', () => {
    expect(HLI_ROUTE).toBe('/health-intake');
    const routing = fs.readFileSync(path.join(ROOT, 'lib/auth/staffRouting.ts'), 'utf8');
    expect(routing).toContain(`'${HLI_ROUTE}'`);
  });

  it('it does not touch the two instruments it sits beside', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    for (const table of [
      'member_body_systems_sessions',
      'member_whole_body_signal_sessions',
      'member_stress_load_sessions',
      'body_systems_questions',
      'whole_body_signal_questions',
    ]) {
      // Named in the source constraint list is fine. Altered is not.
      expect(sql).not.toMatch(new RegExp(`alter table ${table}`, 'i'));
      expect(sql).not.toMatch(new RegExp(`drop table ${table}`, 'i'));
      expect(sql).not.toMatch(new RegExp(`update ${table}`, 'i'));
    }
  });
});

describe('eleven chapters, numbered once', () => {
  it('has exactly eleven, in order, each with a framing line', () => {
    expect(INTAKE_SECTION_COUNT).toBe(11);
    INTAKE_SECTIONS.forEach((section, index) => {
      expect(section.number).toBe(index + 1);
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.framingLine.length).toBeGreaterThan(0);
    });
  });

  it('carries a transition sentence on some chapters and not on every one', () => {
    const withTransition = INTAKE_SECTIONS.filter((section) => section.transitionLine);
    expect(withTransition.length).toBeGreaterThan(0);
    expect(withTransition.length).toBeLessThan(INTAKE_SECTIONS.length);
  });

  it('opens the last chapter with the sentence the brief asked for', () => {
    const last = INTAKE_SECTIONS[INTAKE_SECTIONS.length - 1]!;
    expect(last.key).toBe('symptoms');
    expect(last.transitionLine).toBe(
      'One last area. These questions help us know when something may deserve additional attention.'
    );
  });
});

describe('a field id is a permanent name', () => {
  it('no two different questions share an id', () => {
    const byId = new Map<string, string>();
    for (const field of allFields()) {
      const shape = `${field.kind}:${field.label}`;
      const seen = byId.get(field.id);
      // The symptoms multi-select is deliberately one field spread over four
      // screens, so its repeats must be the same KIND, not the same label.
      if (seen === undefined) byId.set(field.id, field.kind);
      else expect(seen).toBe(field.kind);
      expect(shape.length).toBeGreaterThan(0);
    }
  });

  it('every screen condition names a field that exists', () => {
    const ids = new Set(allFields().map((field) => field.id));
    for (const screen of allScreens()) {
      if (!screen.showWhen) continue;
      expect(ids.has(screen.showWhen.fieldId), `${screen.id} depends on an unknown field`).toBe(
        true
      );
    }
  });

  it('every openedBy names the field the screen condition actually reads', () => {
    for (const screen of allScreens()) {
      if (!screen.openedBy) continue;
      expect(screen.showWhen, `${screen.id} claims an opener but has no condition`).toBeTruthy();
      expect(screen.showWhen!.fieldId).toBe(screen.openedBy);
    }
  });

  it('every per item follow-up points at a multi-select that exists', () => {
    const multi = new Set(
      allFields().filter((field) => field.kind === 'multi_select').map((field) => field.id)
    );
    for (const field of allFields()) {
      if (field.kind !== 'per_item') continue;
      expect(multi.has(field.sourceFieldId), `${field.id} follows an unknown list`).toBe(true);
    }
  });

  it('a per item follow-up is alone on its screen, so it can be cut into groups', () => {
    for (const screen of allScreens()) {
      const perItem = screen.fields.filter((field) => field.kind === 'per_item');
      if (perItem.length === 0) continue;
      expect(screen.fields).toHaveLength(1);
    }
  });
});

describe('progressive disclosure is the default, not a feature of one section', () => {
  it('every repeatable list sits behind a gate that opened it', () => {
    for (const screen of allScreens()) {
      const lists = screen.fields.filter((field) => field.kind === 'entry_list');
      if (lists.length === 0) continue;
      expect(screen.showWhen, `${screen.id} shows a list with no condition`).toBeTruthy();
    }
  });

  it('a gate screen holds one binary question and nothing else', () => {
    const gates = allScreens().filter((screen) =>
      screen.fields.some((field) => field.kind === 'gate')
    );
    expect(gates.length).toBeGreaterThanOrEqual(7);
    for (const screen of gates) {
      expect(isGateScreen(screen), `${screen.id} mixes a gate with other fields`).toBe(true);
    }
  });

  it('health background asks about medications, conditions, supplements and practitioners behind their own gates', () => {
    const background = INTAKE_SECTIONS.find((section) => section.key === 'health_background')!;
    for (const gate of [
      'practitioners_gate',
      'labs_gate',
      'conditions_gate',
      'medications_gate',
      'otc_gate',
      'supplements_gate',
      'allergies_gate',
      'recent_illness_gate',
    ]) {
      expect(
        background.screens.some((screen) => screen.fields.some((field) => field.id === gate))
      ).toBe(true);
    }
  });

  it('asks about pregnancy only when it is relevant to the member', () => {
    const screen = allScreens().find((entry) => entry.id === 'background_pregnancy')!;
    expect(screen.showWhen).toEqual({ fieldId: 'sex', equals: 'female' });
  });
});

describe('what the brief forbade', () => {
  it('never says underweight, overweight or just right', () => {
    for (const text of everyContentString()) {
      expect(text.toLowerCase()).not.toContain('underweight');
      expect(text.toLowerCase()).not.toContain('overweight');
      expect(text.toLowerCase()).not.toContain('just right');
    }
  });

  it('never opens a sentence with a diagnosis', () => {
    for (const text of everyContentString()) {
      for (const opening of FORBIDDEN_DIAGNOSIS_OPENINGS) {
        expect(text.startsWith(opening), `"${text}" starts with "${opening}"`).toBe(false);
      }
    }
  });

  it('uses no clinical register where a person would use plain words', () => {
    const joined = everyContentString().join(' ').toLowerCase();
    for (const clinical of [
      'laboratory procedures',
      'presenting complaint',
      'chief complaint',
      'patient',
      'subject',
      'etiology',
      'comorbid',
    ]) {
      expect(joined).not.toContain(clinical);
    }
  });

  it('finds no em dash and no en dash anywhere in this feature, the migration included', () => {
    for (const file of featureFiles()) {
      if (!fs.statSync(file).isFile()) continue;
      const source = fs.readFileSync(file, 'utf8');
      const emLine = source.split('\n').findIndex((line) => line.includes(EM_DASH));
      const enLine = source.split('\n').findIndex((line) => line.includes(EN_DASH));
      expect(emLine, `${path.basename(file)} line ${emLine + 1}`).toBe(-1);
      expect(enLine, `${path.basename(file)} line ${enLine + 1}`).toBe(-1);
    }
  });
});

describe('section eleven asks about seventeen things, four or five at a time', () => {
  it('offers every one of the seventeen across its screens and no more', () => {
    const symptomScreens = allScreens().filter((screen) =>
      screen.fields.some((field) => field.id === 'symptoms')
    );
    expect(symptomScreens.length).toBe(4);
    const offered = symptomScreens.flatMap((screen) =>
      screen.fields.flatMap((field) => ('options' in field ? field.options.map((o) => o.value) : []))
    );
    expect(new Set(offered).size).toBe(SYMPTOM_OPTIONS.length);
    expect(SYMPTOM_OPTIONS.length).toBe(17);
  });

  it('never puts more than five on one screen', () => {
    for (const screen of allScreens()) {
      for (const field of screen.fields) {
        if (field.id !== 'symptoms' || !('options' in field)) continue;
        expect(field.options.length).toBeLessThanOrEqual(5);
      }
    }
  });

  it('asks "is it getting worse" of the nine where a direction of travel changes what to do', () => {
    // Printed rather than merely counted, so widening the set shows up in a
    // diff as a decision somebody made.
    expect([...WORSENING_SYMPTOMS].sort()).toEqual(
      [
        'bleeding',
        'dizziness',
        'fever',
        'headaches',
        'mood_changes',
        'persistent_pain',
        'shortness_of_breath',
        'skin_changes',
        'urinary_changes',
      ].sort()
    );
    const worsening = allFields().find((field) => field.id === 'symptom_worsening');
    expect(worsening?.kind).toBe('per_item');
    if (worsening?.kind === 'per_item') {
      expect([...(worsening.onlyValues ?? [])].sort()).toEqual([...WORSENING_SYMPTOMS].sort());
    }
  });

  it('asks how often and how long about every reported symptom', () => {
    const frequency = allFields().find((field) => field.id === 'symptom_frequency');
    const duration = allFields().find((field) => field.id === 'symptom_duration');
    expect(frequency?.kind).toBe('per_item');
    expect(duration?.kind).toBe('per_item');
    expect(optionLabel('symptom_frequency', 'most_days')).toBe('Most days');
    expect(optionLabel('symptom_duration', 'several_weeks')).toBe('Several weeks');
  });
});

describe('the opening screen says exactly what the brief approved', () => {
  it('carries the approved title, body and three reassurance points', () => {
    expect(HLI_COPY.introTitle).toBe('Health & Lifestyle Intake');
    expect(HLI_COPY.introBody).toContain('Before we build your plan');
    expect(HLI_COPY.reassuranceOne).toBe('About 8 to 10 minutes');
    expect(HLI_COPY.reassuranceTwo).toBe('Your answers are private');
    expect(HLI_COPY.reassuranceThree).toBe('You can leave and come back');
    expect(HLI_COPY.introButton).toBe('Begin My Intake');
  });

  it('closes on the approved completion words, with no score and no colour', () => {
    expect(HLI_COPY.completionTitle).toBe("You're all set.");
    expect(HLI_COPY.completionBody).toBe(
      "We've got a clearer picture of where you're starting from."
    );
    expect(HLI_COPY.completionCta).toBe('Done');
    const joined = Object.values(HLI_COPY).join(' ').toLowerCase();
    expect(joined).not.toContain('score');
    expect(joined).not.toContain('your result');
  });
});
