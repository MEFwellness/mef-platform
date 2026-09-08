/**
 * Two coach-side presentation fixes, asserted against real rendered HTML
 * and against the real source of the page that cannot be rendered without
 * a database.
 *
 * FIX 1: a client card on /coach reads as a distinct tappable object
 * rather than white on near-white. FIX 2: the full client detail page is
 * reachable from the top of a client's brief, with no scrolling.
 *
 * Presentation only, so these tests also pin the things that must NOT have
 * changed: the same fields, the same words, the same routes.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ClientListPanel, type ClientListEntry } from '../app/coach/ClientListPanel';
import {
  OPEN_FULL_DETAIL_LABEL,
  OpenFullDetailAction,
  openFullDetailAriaLabel,
} from '../app/coach/clients/[id]/FullDetailLink';
import { STATUS_LABEL } from '../lib/wellness/status';

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const CLIENT = (over: Partial<ClientListEntry> = {}): ClientListEntry => ({
  id: 'm-1',
  name: 'Ebony Carter',
  score: 70,
  status: 'attention',
  trend: 'up',
  lastCheckinDate: '2026-09-03',
  hasCheckedInToday: false,
  attentionReasons: [],
  isTest: false,
  ...over,
});

const scored = renderToStaticMarkup(<ClientListPanel clients={[CLIENT()]} />);
const unscored = renderToStaticMarkup(
  <ClientListPanel
    clients={[CLIENT({ id: 'm-2', name: 'Nadia Brooks', score: null, status: 'no-data' })]} />
);

// ---------------------------------------------------------------------------
// FIX 1: the client card
// ---------------------------------------------------------------------------

describe('a client card separates itself from the page it sits on', () => {
  it('carries a real border rather than only a faint shadow', () => {
    expect(scored).toContain('border-[#1B3A2D]/12');
  });

  it('rests on a deeper shadow than the page’s ordinary flat panel', () => {
    // The old card borrowed the flat-panel shadow. It no longer does.
    const card = scored.slice(scored.indexOf('data-client-card="true"'));
    const openTag = card.slice(0, card.indexOf('>'));
    expect(openTag).not.toContain('shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]');
    expect(openTag).toContain('shadow-[0_6px_20px_-10px_rgba(27,58,45,0.28)]');
  });

  it('has a pressed state and a keyboard focus ring, so it feels tappable', () => {
    const card = scored.slice(scored.indexOf('data-client-card="true"'));
    const openTag = card.slice(0, card.indexOf('>'));
    expect(openTag).toContain('mef-press');
    expect(openTag).toContain('mef-focus-ring');
  });

  it('lifts on hover instead of staying flat', () => {
    expect(scored).toContain('hover:shadow-[0_14px_32px_-12px_rgba(27,58,45,0.34)]');
  });

  it('is still one whole-card link to the client, and nothing is nested inside it', () => {
    expect(scored).toContain('href="/coach/clients/m-1"');
    const card = scored.slice(scored.indexOf('data-client-card="true"'));
    const inner = card.slice(0, card.indexOf('</a>'));
    expect(inner).not.toContain('<button');
    expect(inner).not.toContain('<a ');
  });
});

describe('the name is the anchor and the score is the focal point', () => {
  it('sets the name larger and heavier than the lines under it', () => {
    expect(scored).toContain('text-lg font-bold');
    expect(scored).toContain('Ebony Carter');
  });

  it('sets the score in the display face at the largest size on the card', () => {
    expect(scored).toContain('font-[family-name:var(--font-cormorant-garamond)]');
    expect(scored).toContain('text-[2.75rem]');
    expect(scored).toContain('>70<');
  });

  it('keeps the score in its band’s own brand color on its own tinted block', () => {
    // "attention" is the brand gold band in lib/wellness/status.ts.
    expect(scored).toContain('text-[#854D0E]');
    expect(scored).toContain('bg-[#FBF3E3]');
  });

  it('keeps the denominator and the trend glyph the card always showed', () => {
    expect(scored).toContain('/ 100');
    expect(scored).toContain('↑');
    expect(scored).toContain('aria-label="Trend: up"');
  });

  it('gives a client with no score the same block, saying so', () => {
    expect(unscored).toContain('No score yet');
    // The no-data tint, so the card keeps its rhythm rather than collapsing.
    expect(unscored).toContain('bg-[#F3F6F4]');
    expect(unscored).not.toContain('/ 100');
  });
});

describe('the status dot says what it means', () => {
  it('prints the band label beside the dot instead of a bare colored circle', () => {
    expect(scored).toContain(STATUS_LABEL.attention);
    expect(unscored).toContain(STATUS_LABEL['no-data']);
  });

  it('keeps the dot, in the same color lib/wellness/status.ts already decides', () => {
    expect(scored).toContain('bg-[#C4A050]');
  });

  it('invents no status vocabulary of its own', () => {
    const source = read('app/coach/ClientListPanel.tsx');
    expect(source).toContain('STATUS_LABEL[status]');
    expect(source).not.toMatch(/'(Good|Needs attention|Poor|No data)'/);
  });
});

describe('the status lines stay, as chips', () => {
  it('keeps "Checked in today" word for word', () => {
    const html = renderToStaticMarkup(
      <ClientListPanel clients={[CLIENT({ hasCheckedInToday: true })]} />
    );
    expect(html).toContain('Checked in today');
    expect(html).toContain('rounded-full bg-[#F3F6F4]');
  });

  it('keeps the last-check-in sentence word for word when she has not checked in', () => {
    expect(scored).toContain('Last check-in: Sep 3');
  });

  it('keeps an attention reason as its own chip, in the poor band', () => {
    const html = renderToStaticMarkup(
      <ClientListPanel clients={[CLIENT({ attentionReasons: ['No check-in logged today'] })]} />
    );
    expect(html).toContain('No check-in logged today');
    expect(html).toContain('bg-[#F7ECE9]');
  });

  it('still shows at most two reasons, as it always did', () => {
    const html = renderToStaticMarkup(
      <ClientListPanel clients={[CLIENT({ attentionReasons: ['One', 'Two', 'Three'] })]} />
    );
    expect(html).toContain('One');
    expect(html).toContain('Two');
    expect(html).not.toContain('Three');
  });
});

// ---------------------------------------------------------------------------
// FIX 2: full detail from the top
// ---------------------------------------------------------------------------

describe('full client detail is reachable without scrolling', () => {
  const action = renderToStaticMarkup(
    <OpenFullDetailAction memberId="m-1" firstName="Ebony" className="mt-4" />
  );

  it('is a compact action, not another full-width card', () => {
    expect(action).toContain('inline-flex');
    expect(action).toContain('rounded-full');
    expect(action).not.toContain('rounded-[28px]');
  });

  it('goes to the same detail route the bottom card goes to', () => {
    expect(action).toContain('href="/coach/clients/m-1/detail"');
  });

  it('carries the gold treatment and the shared label', () => {
    expect(action).toContain('bg-[#C4A050]');
    expect(action).toContain(OPEN_FULL_DETAIL_LABEL);
  });

  it('names the client for a screen reader rather than reading as an arrow', () => {
    expect(action).toContain(`aria-label="${openFullDetailAriaLabel('Ebony')}"`);
  });

  it('sits in the page header, above every panel on the brief', () => {
    const source = read('app/coach/clients/[id]/page.tsx');
    expect(source).toContain('<OpenFullDetailAction');
    expect(source.indexOf('<OpenFullDetailAction')).toBeLessThan(
      source.indexOf('data-member-entries-link')
    );
    expect(source.indexOf('<OpenFullDetailAction')).toBeLessThan(
      source.indexOf('<CoachDashboardView')
    );
  });

  it('leaves the end-of-page card where it was, on the same route', () => {
    const view = read('app/coach/clients/[id]/CoachDashboardView.tsx');
    expect(view).toContain('data-detail-link="true"');
    expect(view).toContain('/detail`');
  });

  it('reads its label from one constant, so the two doors cannot drift apart', () => {
    const view = read('app/coach/clients/[id]/CoachDashboardView.tsx');
    expect(view).toContain('OPEN_FULL_DETAIL_LABEL');
    expect(view).toContain('openFullDetailAriaLabel(her)');
  });
});

// ---------------------------------------------------------------------------
// House rules
// ---------------------------------------------------------------------------

describe('the standing rules hold across both fixes', () => {
  it('no em dash reaches a coach', () => {
    for (const html of [scored, unscored, renderToStaticMarkup(
      <OpenFullDetailAction memberId="m-1" firstName="Ebony" />
    )]) {
      expect(html).not.toContain('—');
    }
    for (const file of [
      'app/coach/ClientListPanel.tsx',
      'app/coach/clients/[id]/FullDetailLink.tsx',
    ]) {
      expect(read(file)).not.toContain('—');
    }
  });

  it('the card computes no date of its own', () => {
    const source = read('app/coach/ClientListPanel.tsx');
    expect(source).toContain('formatDisplayDate');
    // The one mention of toLocaleDateString is the comment saying why it
    // is not used, so match a call rather than the word.
    expect(source).not.toMatch(/\.toLocale(Date|Time)?String\(/);
    expect(source).not.toContain('new Date(');
  });

  it('the sort rules, the search and the fields on the card are untouched', () => {
    const source = read('app/coach/ClientListPanel.tsx');
    for (const key of ['lowest', 'highest', 'lastCheckin', 'priority']) {
      expect(source).toContain(`case '${key}'`);
    }
    expect(source).toContain('Search clients by name');
    expect(source).toContain('attentionReasons.slice(0, 2)');
  });

  it('a flagged client still carries the test-account label on the new card', () => {
    const html = renderToStaticMarkup(<ClientListPanel clients={[CLIENT({ isTest: true })]} />);
    expect(html).toContain('Test account');
  });
});
