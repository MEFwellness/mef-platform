/**
 * Root Movement, Level 1 — template integrity, against real local
 * Supabase and the real seeded rows (migration 153). No fixtures: the
 * whole point of this file is that the SEEDED SESSIONS THEMSELVES are
 * checked, because they are data the owner will edit, and an edit that
 * breaks one of these rules must fail loudly rather than reach a member.
 *
 * The rules being enforced are the owner's stated methodology:
 *
 *   every slot resolves to a real catalog exercise
 *   every one of those exercises has a working Your Move video
 *   no crunch or loaded spinal flexion anywhere
 *   no release/SMR tier and no power tier
 *   nothing above moderate strain
 *   mobility before stability, stability before strength, core last
 *   each session's real length falls inside its own stated target range
 *   the shared vocabulary stays compact
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { estimateSessionSeconds } from '../lib/movement-sessions/duration';

const EXPECTED_SESSION_KEYS = [
  'morning_mobility',
  'desk_reset',
  'hip_back_reset',
  'shoulder_neck_reset',
  'core_foundation',
  'recovery_day',
];

/**
 * The methodology's ordering, as ranks. A session's slots must never
 * move backwards through these tiers.
 *
 * An exercise usually carries several corrective roles (a hip flexor
 * stretch is stretch AND mobility), so a slot's tier is the HIGHEST rank
 * it carries: an exercise that both stretches and loads is placed by the
 * loading, which is the conservative reading and the one that makes the
 * ordering rule mean something.
 */
const ROLE_RANK: Record<string, number> = {
  stretch: 1,
  mobility: 1,
  stability: 2,
  strength: 3,
  core_stability: 4,
};

type SlotRow = {
  slot_order: number;
  external_id: string;
  prescription_type: 'time' | 'reps';
  prescription_seconds: number | null;
  prescription_reps: number | null;
  rest_seconds: number;
};

type TemplateRow = {
  id: string;
  session_key: string;
  name: string;
  description: string;
  target_duration_min_minutes: number;
  target_duration_max_minutes: number;
  sort_order: number;
  is_active: boolean;
};

type CatalogRow = { external_id: string; name: string; has_video: boolean };
type MetadataRow = {
  external_id: string;
  corrective_roles: string[];
  strain_level: string | null;
  spinal_flexion_core: boolean;
};

let templates: TemplateRow[] = [];
let slotsByTemplate = new Map<string, SlotRow[]>();
let catalog = new Map<string, CatalogRow>();
let metadata = new Map<string, MetadataRow>();

beforeAll(async () => {
  const service = serviceRoleClient();

  const { data: templateRows, error: templateError } = await service
    .from('movement_session_templates')
    .select('*')
    .order('sort_order', { ascending: true });
  if (templateError) throw new Error(`templates read failed: ${templateError.message}`);
  templates = (templateRows as TemplateRow[]) ?? [];

  const { data: slotRows, error: slotError } = await service
    .from('movement_session_template_slots')
    .select('*')
    .order('slot_order', { ascending: true });
  if (slotError) throw new Error(`slots read failed: ${slotError.message}`);

  slotsByTemplate = new Map();
  for (const row of (slotRows as (SlotRow & { template_id: string })[]) ?? []) {
    const list = slotsByTemplate.get(row.template_id) ?? [];
    list.push(row);
    slotsByTemplate.set(row.template_id, list);
  }

  const externalIds = [...new Set(((slotRows as { external_id: string }[]) ?? []).map((r) => r.external_id))];

  const { data: catalogRows } = await service
    .from('exercise_catalog')
    .select('external_id, name, has_video')
    .in('external_id', externalIds);
  catalog = new Map(((catalogRows as CatalogRow[]) ?? []).map((r) => [r.external_id, r]));

  const { data: metadataRows } = await service
    .from('mef_exercise_metadata')
    .select('external_id, corrective_roles, strain_level, spinal_flexion_core')
    .in('external_id', externalIds);
  metadata = new Map(((metadataRows as MetadataRow[]) ?? []).map((r) => [r.external_id, r]));
});

function allSlots(): (SlotRow & { sessionKey: string })[] {
  return templates.flatMap((template) =>
    (slotsByTemplate.get(template.id) ?? []).map((slot) => ({ ...slot, sessionKey: template.session_key }))
  );
}

describe('Root Movement templates — the six sessions exist as data (migration 153)', () => {
  it('seeds exactly the six sessions, active and ordered', () => {
    expect(templates.map((t) => t.session_key)).toEqual(EXPECTED_SESSION_KEYS);
    expect(templates.every((t) => t.is_active)).toBe(true);
    expect(templates.map((t) => t.sort_order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('gives every session a name and one honest member-facing sentence', () => {
    for (const template of templates) {
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(20);
      // Root's voice: no em dashes, no exclamation-heavy hype.
      expect(template.description).not.toMatch(/—/);
      expect(template.description).not.toMatch(/!/);
      expect(template.name).not.toMatch(/—/);
    }
  });

  it('gives every session at least eight ordered, contiguous slots', () => {
    for (const template of templates) {
      const slots = slotsByTemplate.get(template.id) ?? [];
      expect(slots.length).toBeGreaterThanOrEqual(8);
      expect(slots.map((s) => s.slot_order)).toEqual(slots.map((_, i) => i + 1));
    }
  });
});

describe('Root Movement templates — every slot resolves to a real exercise with video', () => {
  it('resolves every slot to a catalog row', () => {
    const unresolved = allSlots().filter((slot) => !catalog.has(slot.external_id));
    expect(unresolved.map((s) => `${s.sessionKey}#${s.slot_order}`)).toEqual([]);
  });

  it('has a working Your Move video for every selected exercise', () => {
    const withoutVideo = allSlots().filter((slot) => catalog.get(slot.external_id)?.has_video !== true);
    expect(withoutVideo.map((s) => `${s.sessionKey}#${s.slot_order}`)).toEqual([]);
  });

  it('has corrective metadata for every selected exercise', () => {
    const untagged = allSlots().filter((slot) => !metadata.has(slot.external_id));
    expect(untagged.map((s) => `${s.sessionKey}#${s.slot_order}`)).toEqual([]);
  });
});

describe('Root Movement templates — the assembly rules', () => {
  /**
   * GUARD TEST. Proven by breaking it: swapping any slot's external_id
   * for a spinal-flexion exercise (e.g. the catalog's "Half Roll Backs")
   * fails this test by name before it could ever reach a member.
   */
  it('contains no crunch or loaded spinal flexion anywhere', () => {
    const offenders = allSlots().filter((slot) => metadata.get(slot.external_id)?.spinal_flexion_core === true);
    expect(
      offenders.map((s) => `${s.sessionKey}#${s.slot_order} ${catalog.get(s.external_id)?.name}`)
    ).toEqual([]);
  });

  /**
   * GUARD TEST. Proven by breaking it: pointing a slot at a release-tier
   * (SMR) or power-tier exercise fails here. These members are
   * unassessed, and neither tier belongs in a session nobody supervises.
   */
  it('contains no release-tier or power-tier work', () => {
    const offenders = allSlots().filter((slot) => {
      const roles = metadata.get(slot.external_id)?.corrective_roles ?? [];
      return roles.includes('release') || roles.includes('power');
    });
    expect(
      offenders.map((s) => `${s.sessionKey}#${s.slot_order} ${catalog.get(s.external_id)?.name}`)
    ).toEqual([]);
  });

  it('contains nothing above moderate strain', () => {
    const offenders = allSlots().filter((slot) => metadata.get(slot.external_id)?.strain_level === 'high');
    expect(
      offenders.map((s) => `${s.sessionKey}#${s.slot_order} ${catalog.get(s.external_id)?.name}`)
    ).toEqual([]);
  });

  it('orders mobility before stability, stability before strength, and core work last', () => {
    for (const template of templates) {
      const slots = slotsByTemplate.get(template.id) ?? [];
      const ranks = slots.map((slot) => {
        const roles = metadata.get(slot.external_id)?.corrective_roles ?? [];
        return Math.max(0, ...roles.map((role) => ROLE_RANK[role] ?? 0));
      });

      // Non-decreasing: a session never returns to a lower tier once it
      // has moved past it.
      for (let i = 1; i < ranks.length; i += 1) {
        expect(
          ranks[i]! >= ranks[i - 1]!,
          `${template.session_key}: slot ${i + 1} (${catalog.get(slots[i]!.external_id)?.name}) comes after a higher tier`
        ).toBe(true);
      }

      // When a session has core work at all, it is the tail of it.
      const coreIndexes = ranks.flatMap((rank, i) => (rank === ROLE_RANK.core_stability ? [i] : []));
      if (coreIndexes.length > 0) {
        expect(coreIndexes[coreIndexes.length - 1]).toBe(ranks.length - 1);
      }
    }
  });

  it('keeps every prescription to exactly one shape, time or reps', () => {
    for (const slot of allSlots()) {
      if (slot.prescription_type === 'time') {
        expect(slot.prescription_seconds).toBeGreaterThan(0);
        expect(slot.prescription_reps).toBeNull();
      } else {
        expect(slot.prescription_reps).toBeGreaterThan(0);
        expect(slot.prescription_seconds).toBeNull();
      }
      expect(slot.rest_seconds).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Root Movement templates — durations and vocabulary', () => {
  it('lands every session inside its own stated target range', () => {
    for (const template of templates) {
      const slots = slotsByTemplate.get(template.id) ?? [];
      const minutes = estimateSessionSeconds(slots) / 60;
      expect(
        minutes >= template.target_duration_min_minutes,
        `${template.session_key} is ${minutes.toFixed(1)} min, under its ${template.target_duration_min_minutes} min floor`
      ).toBe(true);
      expect(
        minutes <= template.target_duration_max_minutes,
        `${template.session_key} is ${minutes.toFixed(1)} min, over its ${template.target_duration_max_minutes} min ceiling`
      ).toBe(true);
    }
  });

  it('keeps the shared vocabulary compact, under forty distinct exercises', () => {
    const distinct = new Set(allSlots().map((slot) => slot.external_id));
    expect(distinct.size).toBeLessThan(40);
  });

  it('reuses that vocabulary rather than giving each session its own', () => {
    // Six sessions of eight or more slots is 48+ slots; a vocabulary of
    // under 40 means real reuse across them, which is what makes a member
    // meet the same movements again instead of a new one every screen.
    expect(allSlots().length).toBeGreaterThan(new Set(allSlots().map((s) => s.external_id)).size);
  });
});
