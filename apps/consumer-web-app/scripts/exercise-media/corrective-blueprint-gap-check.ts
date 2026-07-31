#!/usr/bin/env npx tsx
/**
 * Coverage check for the 4 named corrective blueprints (Lower Cross, Upper
 * Cross, Forward Head, Flat Back) against the live corrective metadata in
 * mef_exercise_metadata — reads the real local Supabase DB directly rather
 * than a frozen JSON snapshot, so it automatically reflects both the
 * auto-classified Your Move catalog (migration 128) and any MEF-authored
 * custom exercises (migration 130) with zero risk of the two drifting out
 * of sync.
 *
 * For every blueprint slot, counts how many exercises match:
 *   tight muscle  -> release / stretch / mobility options (muscles_stretched)
 *   long muscle   -> strengthen/stabilize options (muscles_strengthened,
 *                    role in strength/stability/power), plus a separate
 *                    core_stability-only count for slots that call for it
 *                    (e.g. Lower Cross's TVA slot)
 *
 * The rule: every slot needs at least MIN_OPTIONS_PER_SLOT (3) usable
 * exercises. Writes docs/CORRECTIVE_BLUEPRINT_GAP_CHECK.md.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/corrective-blueprint-gap-check.ts
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CorrectiveRole } from '../../lib/exercise-library/correctiveClassification';
import { CORRECTIVE_BLUEPRINT_LIST } from '../../lib/corrective-engine/blueprints';
import type { MuscleSlot } from '../../lib/corrective-engine/types';

const OUTPUT_PATH = path.resolve(__dirname, '../../../../docs/CORRECTIVE_BLUEPRINT_GAP_CHECK.md');
const MIN_OPTIONS_PER_SLOT = 3;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

interface Entry {
  correctiveRoles: CorrectiveRole[];
  musclesStretched: string[];
  musclesStrengthened: string[];
}

type Slot = MuscleSlot;

interface Blueprint {
  name: string;
  tight: Slot[];
  long: Slot[];
  /** Long-muscle slots that must be filled with core_stability role specifically (not general strength) — e.g. Lower Cross's TVA. */
  coreStabilityOnlySlots?: string[];
}

// Sourced from lib/corrective-engine/blueprints.ts — the same data the
// corrective program generator engine builds sessions from, so this report
// can never drift out of sync with what the engine actually selects.
const BLUEPRINTS: Blueprint[] = CORRECTIVE_BLUEPRINT_LIST.map((bp) => ({
  name: bp.name.toUpperCase(),
  tight: bp.tightMuscles,
  long: bp.longMuscles,
  ...(bp.coreStabilityOnlySlots ? { coreStabilityOnlySlots: bp.coreStabilityOnlySlots } : {}),
}));

function matchesAny(arr: string[], labels: string[]): boolean {
  return labels.some((l) => arr.includes(l));
}

function countTight(entries: Entry[], labels: string[]) {
  if (labels.length === 0) return { release: 0, stretch: 0, mobility: 0 };
  const has = (e: Entry, role: CorrectiveRole) =>
    e.correctiveRoles.includes(role) && matchesAny(e.musclesStretched, labels);
  return {
    release: entries.filter((e) => has(e, 'release')).length,
    stretch: entries.filter((e) => has(e, 'stretch')).length,
    mobility: entries.filter((e) => has(e, 'mobility')).length,
  };
}

function countLong(entries: Entry[], labels: string[], coreStabilityOnly: boolean) {
  if (labels.length === 0) return { strengthenStabilize: 0, coreStability: 0 };
  const coreStability = entries.filter(
    (e) => e.correctiveRoles.includes('core_stability') && matchesAny(e.musclesStrengthened, labels)
  ).length;
  if (coreStabilityOnly) return { strengthenStabilize: 0, coreStability };
  const strengthenStabilize = entries.filter(
    (e) =>
      matchesAny(e.musclesStrengthened, labels) &&
      (e.correctiveRoles.includes('strength') ||
        e.correctiveRoles.includes('stability') ||
        e.correctiveRoles.includes('power'))
  ).length;
  return { strengthenStabilize, coreStability };
}

async function fetchEntries(supabase: SupabaseClient): Promise<Entry[]> {
  const all: Entry[] = [];
  const PAGE_SIZE = 500;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('mef_exercise_metadata')
      .select('corrective_roles, muscles_stretched, muscles_strengthened')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read mef_exercise_metadata: ${error.message}`);
    const rows = (data ?? []) as {
      corrective_roles: CorrectiveRole[];
      muscles_stretched: string[];
      muscles_strengthened: string[];
    }[];
    all.push(
      ...rows.map((r) => ({
        correctiveRoles: r.corrective_roles,
        musclesStretched: r.muscles_stretched,
        musclesStrengthened: r.muscles_strengthened,
      }))
    );
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

async function main() {
  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );
  const entries = await fetchEntries(supabase);

  let md = `# Corrective blueprint gap check\n\n`;
  md += `Generated from the live \`mef_exercise_metadata\` table (${entries.length} classified exercises — the auto-classified Your Move catalog plus MEF-authored custom exercises, migrations 128 and 130) against the 4 corrective blueprints. Every slot needs at least ${MIN_OPTIONS_PER_SLOT} usable exercises. A muscle with no canonical label anywhere in the data at all is a structural gap, not just a thin one.\n\n`;

  const zeroSlots: string[] = [];
  const belowMinimumSlots: string[] = [];

  for (const bp of BLUEPRINTS) {
    md += `## ${bp.name}\n\n`;
    md += `### Tight (release / stretch / mobilize)\n\n`;
    md += `| Muscle | Release options | Stretch options | Mobility options | Total |\n|---|---|---|---|---|\n`;
    for (const slot of bp.tight) {
      const counts = countTight(entries, slot.canonicalLabels);
      const total = counts.release + counts.stretch + counts.mobility;
      md += `| ${slot.muscle} | ${counts.release} | ${counts.stretch} | ${counts.mobility} | ${total} |\n`;
      const label = `${bp.name} — tight — ${slot.muscle}`;
      if (total === 0) zeroSlots.push(label);
      else if (total < MIN_OPTIONS_PER_SLOT) belowMinimumSlots.push(`${label} (${total})`);
    }
    md += `\n### Long (strengthen / stabilize)\n\n`;
    md += `| Muscle | Strengthen/stabilize options | Core-stability (non-flexion) options | Total |\n|---|---|---|---|\n`;
    for (const slot of bp.long) {
      const coreOnly = bp.coreStabilityOnlySlots?.includes(slot.muscle) ?? false;
      const counts = countLong(entries, slot.canonicalLabels, coreOnly);
      const total = coreOnly ? counts.coreStability : counts.strengthenStabilize;
      md += `| ${slot.muscle}${coreOnly ? ' (core_stability only)' : ''} | ${coreOnly ? '—' : counts.strengthenStabilize} | ${counts.coreStability} | ${total} |\n`;
      const label = `${bp.name} — long — ${slot.muscle}`;
      if (total === 0) zeroSlots.push(label);
      else if (total < MIN_OPTIONS_PER_SLOT) belowMinimumSlots.push(`${label} (${total})`);
    }
    md += `\n`;
  }

  const pass = zeroSlots.length === 0 && belowMinimumSlots.length === 0;
  md += `## Result: ${pass ? `PASS — every slot has ≥${MIN_OPTIONS_PER_SLOT} options` : 'FAIL'}\n\n`;
  md += `## Zero-coverage slots (${zeroSlots.length})\n\n`;
  md += zeroSlots.length ? zeroSlots.map((s) => `- ${s}`).join('\n') + '\n\n' : '- None\n\n';
  md += `## Below-minimum slots, <${MIN_OPTIONS_PER_SLOT} options (${belowMinimumSlots.length})\n\n`;
  md += belowMinimumSlots.length ? belowMinimumSlots.map((s) => `- ${s}`).join('\n') + '\n\n' : '- None\n\n';

  writeFileSync(OUTPUT_PATH, md);
  console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);
  console.log(`Zero-coverage slots: ${zeroSlots.length}`);
  for (const s of zeroSlots) console.log(`  - ${s}`);
  console.log(`Below-minimum slots (<${MIN_OPTIONS_PER_SLOT}): ${belowMinimumSlots.length}`);
  for (const s of belowMinimumSlots) console.log(`  - ${s}`);
  console.log(`Report: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
