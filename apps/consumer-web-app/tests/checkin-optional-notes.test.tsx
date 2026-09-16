/**
 * THE TWO OPTIONAL BOXES ON THE DAILY CHECK-IN.
 *
 * WHAT THE BRIEF ASKED FOR, and what each of these holds:
 *   the box appears ONLY when she answers yes;
 *   it is optional everywhere and never required;
 *   never more than one short box per item;
 *   its absence changes nothing, anywhere;
 *   and no scoring moves because of it.
 *
 * THE LAST TWO ARE THE ONES WORTH GUARDING. A new column on
 * daily_checkins is one grep away from being read by something that
 * computes a number, and "optional" is one `required` attribute away from
 * being a wall a member cannot get past at the end of her check-in.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { OptionalFollowUpNote } from '@/components/checkin/OptionalFollowUpNote';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const FORM = source('app/checkin/CheckinForm.tsx');
const ACTION = source('app/actions/checkin.ts');
const COMPONENT = source('components/checkin/OptionalFollowUpNote.tsx');

describe('the box itself', () => {
  const html = renderToStaticMarkup(
    <OptionalFollowUpNote
      id="concern-note"
      label="Want to tell me more? (optional)"
      placeholder="A sentence is plenty"
      value=""
      onChange={() => {}}
    />
  );

  it('says it is optional, in the words the brief asked for', () => {
    expect(html).toContain('Want to tell me more? (optional)');
  });

  it('is never required, and carries no minimum length', () => {
    expect(html).not.toContain('required');
    expect(html).not.toContain('minlength');
    expect(html).not.toContain('aria-required');
  });

  it('is one short box and not a form', () => {
    expect((html.match(/<textarea/g) ?? []).length).toBe(1);
    expect(html).toContain('rows="2"');
    expect(html).not.toContain('<button');
  });

  it('is labelled, so it is reachable rather than merely visible', () => {
    expect(html).toContain('for="concern-note"');
    expect(html).toContain('id="concern-note"');
  });

  it('renders whatever she has already typed, so exiting and returning keeps it', () => {
    const resumed = renderToStaticMarkup(
      <OptionalFollowUpNote
        id="discomfort-note"
        label="Anything else about this? (optional)"
        placeholder="x"
        value="left knee, worse on stairs"
        onChange={() => {}}
      />
    );
    expect(resumed).toContain('left knee, worse on stairs');
  });

  it('has no em dash in any string it can render', () => {
    expect(COMPONENT.split('\n').filter((line) => line.includes('—'))).toHaveLength(0);
    expect(html).not.toContain('—');
  });
});

describe('it appears only on yes', () => {
  it('the concern box is inside a branch on the concern answer', () => {
    expect(FORM).toMatch(/if \(concern\) \{[\s\S]{0,600}key: 'concern-note'/);
  });

  it('the discomfort box is inside a branch on the discomfort answer', () => {
    expect(FORM).toMatch(/if \(hasDiscomfort\) \{[\s\S]{0,600}key: 'discomfort-note'/);
  });

  it('neither is ever a required screen', () => {
    // A unit with a blockedReason cannot be walked past. These two must
    // never be able to stop her finishing.
    for (const key of ['concern-note', 'discomfort-note']) {
      const at = FORM.indexOf(`key: '${key}'`);
      expect(at, key).toBeGreaterThan(-1);
      const block = FORM.slice(at, at + 260);
      expect(block, key).toContain('blockedReason: null');
      expect(block, key).toContain('answered: true');
    }
  });

  it('answering no again takes the sentence with it', () => {
    expect(FORM).toContain("setDiscomfortNote('')");
    expect(FORM).toContain('if (!value) setConcernNote');
  });
});

describe('its absence changes nothing', () => {
  it('an untyped box submits null, not an empty string', () => {
    expect(FORM).toContain(
      "concern_note: concern && concernNote.trim() ? concernNote.trim() : null"
    );
    expect(FORM).toContain(
      "discomfort_note: hasDiscomfort && discomfortNote.trim() ? discomfortNote.trim() : null"
    );
  });

  it('the action defaults both to null before the row is written', () => {
    expect(ACTION).toContain('p_concern_note: input.concern_note ?? null');
    expect(ACTION).toContain('p_discomfort_note: input.discomfort_note ?? null');
  });

  it('an empty box is skipped before classification ever starts', () => {
    const service = source('lib/cross-system-complaints/service.ts');
    expect(service).toContain("input.rawText.trim().length === 0");
  });
});

describe('no scoring reads either column', () => {
  /**
   * THE REAL GUARD, not a promise. If anything that computes a number ever
   * reads one of these, this fails. The list is every place in this app
   * that turns check-in answers into a figure.
   */
  const SCORING_DIRECTORIES = [
    'lib/scoring',
    'lib/wellness',
    'lib/coaching-direction',
    'lib/longitudinal-intelligence',
    'lib/body-systems',
    'lib/whole-body-signal',
    'lib/member-counts',
    'lib/priority',
    'lib/analytics',
  ];

  it.each(SCORING_DIRECTORIES)('%s never reads concern_note or discomfort_note', (directory) => {
    const base = path.resolve(__dirname, '..', directory);
    if (!fs.existsSync(base)) return;
    const stack = [base];
    const offenders: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
        const text = fs.readFileSync(full, 'utf-8');
        if (text.includes('concern_note') || text.includes('discomfort_note')) {
          offenders.push(full);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toHaveLength(0);
  });

  it('is non vacuous: the scan really reads those directories', () => {
    const base = path.resolve(__dirname, '..', 'lib/scoring');
    expect(fs.existsSync(base)).toBe(true);
    expect(fs.readdirSync(base).length).toBeGreaterThan(0);
  });
});

describe('both boxes reach the safety layer before anything else reads them', () => {
  it('the real submit screens all three fields together', () => {
    expect(ACTION).toContain(
      '[input.optional_notes, input.concern_note, input.discomfort_note]'
    );
    // And it is still the same central classifier, not a second one.
    expect(ACTION).toContain('evaluateConcern(supabase, {');
  });

  it('the draft save screens them too, because an exit is not a reason to skip it', () => {
    const draft = ACTION.slice(ACTION.indexOf('export async function saveDailyCheckinDraft'));
    expect(draft).toContain('input.concern_note');
    expect(draft).toContain('evaluateConcern');
  });

  it('classification runs after the safety block, never instead of it', () => {
    const safetyAt = ACTION.indexOf('sourceFeature: \'daily_checkin\'');
    const rootAt = ACTION.indexOf('hearComplaints([');
    expect(safetyAt).toBeGreaterThan(-1);
    expect(rootAt).toBeGreaterThan(safetyAt);
  });
});
