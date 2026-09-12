/**
 * Who is offered it, how it is sent, and what the server refuses.
 *
 * THE ASSIGNMENT IS THE WHOLE GATE, which is a claim in three places at
 * once: the access rule that decides what is OFFERED, the migration's own
 * insert policy that decides what can be WRITTEN, and the pop-up chain and
 * Home card that both read the one composed state. All three are asserted
 * here, the last two by reading the real source, because a screen wired to
 * a second rule is exactly the invisible lock the standing rules forbid.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveHliAccess } from '@/lib/health-intake/access';
import {
  HLI_DEFAULT_DUE_IN_DAYS,
  HLI_DEFINITION_ID,
  HLI_KEY,
  HLI_LABEL,
  HLI_ROUTE,
} from '@/lib/health-intake/constants';
import { healthIntakePopupMessageKey } from '@/lib/root-popup-messages/data';
import { PROTECTED_POPUP_KINDS } from '@/lib/root-popup-messages/oneKnock';
import { listAssignableTemplates } from '@/lib/assignments/assignableCatalog';
import { assignmentNameFor } from '@/lib/assignments/experienceNames';
import { DETAIL_SECTIONS, searchDetailPage } from '@/lib/coach-detail/sections';
import { sanitizeAnswers, sanitizeWithArchive, formatHeight } from '@/lib/health-intake/sanitize';
import type { HliAssignment, HliSessionRecord } from '@/lib/health-intake/data';

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ASSIGNMENT: HliAssignment = {
  id: 'assignment-1',
  createdAt: '2026-09-12T10:00:00Z',
  reason: null,
  dueAt: '2026-09-19T00:00:00Z',
};
const SESSION: HliSessionRecord = {
  id: 'session-1',
  assignmentId: 'assignment-1',
  contentVersion: 1,
  answers: {},
  archived: {},
  stepIndex: 0,
  safetyEscalatedAt: null,
  startedAt: '2026-09-12T10:05:00Z',
  completedAt: '2026-09-12T10:20:00Z',
  createdAt: '2026-09-12T10:05:00Z',
  updatedAt: '2026-09-12T10:20:00Z',
};

describe('the access rule', () => {
  it('offers it to a member with an open assignment', () => {
    expect(
      resolveHliAccess({
        assignmentRead: { ok: true, assignment: ASSIGNMENT },
        sessionRead: { ok: true, records: [] },
      })
    ).toEqual({ kind: 'assigned', assignment: ASSIGNMENT });
  });

  it('offers nothing to a member nobody assigned it to', () => {
    expect(
      resolveHliAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: true, records: [] },
      })
    ).toEqual({ kind: 'none' });
  });

  it('hands back a finished sitting once the assignment has closed', () => {
    expect(
      resolveHliAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: true, records: [SESSION] },
      })
    ).toEqual({ kind: 'completed', session: SESSION });
  });

  it('fails shut on a read that failed', () => {
    expect(
      resolveHliAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [SESSION] },
      })
    ).toEqual({ kind: 'none' });
  });
});

describe('nothing gates it twice', () => {
  it('there is no tier check, no visibility key and no grant column anywhere in the feature', () => {
    for (const file of [
      'lib/health-intake/access.ts',
      'lib/health-intake/service.ts',
      'lib/health-intake/view.ts',
      'app/health-intake/page.tsx',
      'app/actions/healthIntake.ts',
    ]) {
      const source = read(file);
      expect(source).not.toContain('membership');
      expect(source).not.toContain('minLevel');
      expect(source).not.toContain('getMemberVisibility');
      expect(source).not.toContain('visibility_key');
    }
  });

  it('the database refuses a sitting without a pending assignment of her own', () => {
    const sql = fs.readFileSync(
      path.resolve(ROOT, '../../supabase/migrations/00000000000230_health_lifestyle_intake.sql'),
      'utf8'
    );
    expect(sql).toContain('member_insert_own_health_intake');
    expect(sql).toContain("a.status = 'pending'");
    expect(sql).toContain(`a.assessment_definition_id = '${HLI_DEFINITION_ID}'`);
  });

  it('completion is write once, enforced by the update policy and not by the app', () => {
    const sql = fs.readFileSync(
      path.resolve(ROOT, '../../supabase/migrations/00000000000230_health_lifestyle_intake.sql'),
      'utf8'
    );
    expect(sql).toContain('using (member_id = auth.uid() and completed_at is null)');
  });

  it('a coach may read a sitting and may never write one', () => {
    const sql = fs.readFileSync(
      path.resolve(ROOT, '../../supabase/migrations/00000000000230_health_lifestyle_intake.sql'),
      'utf8'
    );
    expect(sql).toContain('coach_read_assigned_health_intake');
    expect(sql).not.toMatch(/create policy coach_write_health_intake/);
  });
});

describe('the pop-up chain', () => {
  it('has its own key prefix, so no other dismissal can silence it', () => {
    expect(healthIntakePopupMessageKey('abc')).toBe('health_intake:abc');
    expect(healthIntakePopupMessageKey('abc')).not.toContain('whole_body_signal');
    expect(healthIntakePopupMessageKey('abc')).not.toContain('body_systems');
  });

  it('is a protected kind, so a quiet day never delays a coach assignment', () => {
    expect(PROTECTED_POPUP_KINDS).toContain('health_intake_assigned');
  });

  it('checks its own due-ness inside its own branch, and falls through', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf('const healthIntake = await getMyHealthIntake();'));
    const upToReturn = branch.slice(0, branch.indexOf('return {'));
    expect(upToReturn).toContain('isRecurringMessageDue(messageKey)');
  });

  it('knocks for a sitting she has started as well as one she has not opened', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    expect(chain).toContain(
      "healthIntake?.status === 'pending' || healthIntake?.status === 'in_progress'"
    );
  });

  it('writes a delivery receipt on a real display, on both surfaces', () => {
    const popup = read('components/dashboard/RootMessagePopupClient.tsx');
    const intakeBranch = popup.slice(popup.indexOf("message.kind === 'health_intake_assigned'"));
    expect(intakeBranch.slice(0, 700)).toContain('TrackAssignmentDelivered');
    expect(read('components/health-intake/HealthIntakeEntry.tsx')).toContain(
      'TrackAssignmentDelivered'
    );
  });
});

describe('the coach sends it from the one place everything else is sent from', () => {
  it('appears in the assignable catalog, named by the shared map', () => {
    const row = listAssignableTemplates().find((entry) => entry.id === HLI_KEY);
    expect(row).toBeTruthy();
    expect(row!.definitionId).toBe(HLI_DEFINITION_ID);
    expect(row!.displayName).toBe(HLI_LABEL);
    expect(row!.assignKey).toBeNull();
    // Not reassignable today, like everything but the two instruments that
    // draw a real reassessment comparison.
    expect(row!.allowsReassign).toBe(false);
  });

  it('is named the same thing wherever an assignment row is printed', () => {
    expect(assignmentNameFor(HLI_DEFINITION_ID)).toBe(HLI_LABEL);
  });

  it('routes to its own action, with its own seven day default', () => {
    const dispatcher = read('app/actions/coachAssessmentRowAssign.ts');
    expect(dispatcher).toContain("'health-lifestyle-intake': assignHealthIntakeAction");
    expect(HLI_DEFAULT_DUE_IN_DAYS).toBe(7);
    expect(read('app/actions/healthIntake.ts')).toContain('HLI_DEFAULT_DUE_IN_DAYS');
  });

  it('lands in its own section on the client detail page, and in the pinned search', () => {
    const section = DETAIL_SECTIONS.find((entry) => entry.id === 'detail-section-health-context');
    expect(section).toBeTruthy();
    expect(section!.cards.map((card) => card.id)).toEqual(['detail-card-health-intake']);
    const results = searchDetailPage('health');
    expect(results.some((result) => result.anchorId === 'detail-card-health-intake')).toBe(true);
  });

  it('renders the card the section indexes, at the anchor the search points at', () => {
    const page = read('app/coach/clients/[id]/detail/page.tsx');
    expect(page).toContain('id="detail-section-health-context"');
    expect(page).toContain('id="detail-card-health-intake"');
    expect(page).toContain('<HealthContextPanel');
  });
});

describe('nothing writes on a render', () => {
  it('the route reads and redirects, and inserts nothing', () => {
    const page = read('app/health-intake/page.tsx');
    expect(page).not.toContain('.insert(');
    expect(page).not.toContain('.upsert(');
    expect(page).not.toContain('Action(');
  });

  it('the Home card and the pop-up branch make no draft row', () => {
    expect(read('components/health-intake/HealthIntakeEntry.tsx')).not.toContain('.insert(');
    const service = read('lib/health-intake/service.ts');
    expect(service).not.toContain('.insert(');
    expect(service).not.toContain('.upsert(');
  });

  it('the draft row is created by a save and by nothing else', () => {
    const data = read('lib/health-intake/data.ts');
    // Exactly one insert in the whole feature, and it is the save.
    const inserts = data.split('\n').filter((line) => line.includes('.insert('));
    expect(inserts).toHaveLength(1);
    expect(data).toContain('export async function saveHliProgress');
    /*
      AND IT IS NOT AN UPSERT, which is the bug this line now guards.
      Found on production, 2026-09-12: the one-row-per-assignment index is
      partial, Postgres will not take a partial index as an ON CONFLICT
      arbiter, and PostgREST's onConflict cannot repeat its predicate, so
      every save was refused and a member answered ten chapters into
      nothing. tests/health-intake-integration.test.ts proves the behaviour
      against the real index; this keeps the shape from coming back.
    */
    expect(data).not.toContain('.upsert(');
  });
});

describe('the server refuses what the screen never offered', () => {
  it('drops a field that does not exist', () => {
    expect(sanitizeAnswers({ not_a_field: 'x' })).toEqual({});
  });

  it('drops an option no question offers', () => {
    expect(sanitizeAnswers({ weight_change: 'exploded' })).toEqual({});
    expect(sanitizeAnswers({ weight_change: 'lost' })).toEqual({ weight_change: 'lost' });
  });

  it('drops a gate answer that is neither yes nor no', () => {
    expect(sanitizeAnswers({ medications_gate: 'maybe' })).toEqual({});
  });

  it('holds the ten point mark to the ten points', () => {
    expect(sanitizeAnswers({ stress_level: 90 })).toEqual({});
    expect(sanitizeAnswers({ stress_level: 0 })).toEqual({});
    expect(sanitizeAnswers({ stress_level: 8 })).toEqual({ stress_level: 8 });
    expect(sanitizeAnswers({ stress_level: '8' })).toEqual({});
  });

  it('refuses a date or a time that is not one', () => {
    expect(sanitizeAnswers({ date_of_birth: 'yesterday' })).toEqual({});
    expect(sanitizeAnswers({ date_of_birth: '1986-04-02' })).toEqual({
      date_of_birth: '1986-04-02',
    });
    expect(
      sanitizeAnswers({ night_waking: 'yes', night_waking_time: '25:00' })['night_waking_time']
    ).toBeUndefined();
    expect(
      sanitizeAnswers({ night_waking: 'yes', night_waking_time: '03:00' })['night_waking_time']
    ).toBe('03:00');
  });

  it('refuses a height that is not one the picker can produce', () => {
    expect(sanitizeAnswers({ height: '5 feet 7' })).toEqual({});
    expect(sanitizeAnswers({ height: formatHeight(5, 7) })).toEqual({ height: '5 ft 7 in' });
  });

  it('applies the exclusive rule to a hand made post too', () => {
    expect(sanitizeAnswers({ movement_areas: ['stairs', 'movement_none'] })).toEqual({
      movement_areas: ['movement_none'],
    });
  });

  it('refuses a per item follow-up about an item she never chose', () => {
    const clean = sanitizeAnswers({
      movement_areas: ['stairs'],
      movement_impact: { stairs: 'a_lot', lifting: 'a_lot' },
    });
    expect(clean['movement_impact']).toEqual({ stairs: 'a_lot' });
  });

  it('refuses an answer on a branch her own gate did not open', () => {
    const { kept, dropped } = sanitizeWithArchive({
      medications_gate: 'no',
      medications: [{ medication_name: 'Levothyroxine' }],
    });
    expect(kept['medications']).toBeUndefined();
    expect(dropped['medications']).toHaveLength(1);
  });

  it('refuses an entry with nothing in its required field', () => {
    expect(
      sanitizeAnswers({
        medications_gate: 'yes',
        medications: [{ medication_reason: 'Thyroid' }],
      })['medications']
    ).toBeUndefined();
  });

  it('stores nothing for a blank, so a cleared box stops counting', () => {
    expect(sanitizeAnswers({ occupation: '   ' })).toEqual({});
  });

  it('names the route only in one place, so the pop-up and the card cannot drift', () => {
    expect(HLI_ROUTE).toBe('/health-intake');
    for (const file of [
      'components/health-intake/HealthIntakeEntry.tsx',
      'app/actions/rootPopupMessages.ts',
    ]) {
      expect(read(file)).toContain('HLI_ROUTE');
    }
  });
});
