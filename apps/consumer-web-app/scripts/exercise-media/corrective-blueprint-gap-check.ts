#!/usr/bin/env npx tsx
/**
 * Coverage check for the 4 named corrective blueprints (Lower Cross, Upper
 * Cross, Forward Head, Flat Back) against the classification produced by
 * generate-corrective-metadata.ts. Reads docs/exercise-media/
 * corrective-metadata-report.json directly — no DB connection needed,
 * since that report already is the exact data the migration wrote.
 *
 * For every blueprint slot, counts how many exercises match:
 *   tight muscle  -> release / stretch / mobility options (musclesStretched)
 *   long muscle   -> strengthen/stabilize options (musclesStrengthened,
 *                    role in strength/stability/power), plus a separate
 *                    core_stability-only count for slots that call for it
 *                    (e.g. Lower Cross's TVA slot)
 *
 * Writes docs/CORRECTIVE_BLUEPRINT_GAP_CHECK.md.
 *
 * Usage: npx tsx scripts/exercise-media/corrective-blueprint-gap-check.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CorrectiveRole } from '../../lib/exercise-library/correctiveClassification';

const REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/corrective-metadata-report.json');
const OUTPUT_PATH = path.resolve(__dirname, '../../../../docs/CORRECTIVE_BLUEPRINT_GAP_CHECK.md');

interface Entry {
  externalId: string;
  name: string;
  correctiveRoles: CorrectiveRole[];
  musclesStretched: string[];
  musclesStrengthened: string[];
  spinalFlexionCore: boolean;
}

interface Report {
  entries: Entry[];
}

interface Slot {
  muscle: string;
  /** Canonical label as it actually appears in musclesStretched/musclesStrengthened — see correctiveClassification.ts's MUSCLE_CANON. Null means this blueprint muscle has no matching canonical label in the catalog data at all (an automatic, structural gap). */
  canonicalLabel: string | null;
}

interface Blueprint {
  name: string;
  tight: Slot[];
  long: Slot[];
  /** Long-muscle slots that must be filled with core_stability role specifically (not general strength) — e.g. Lower Cross's TVA. */
  coreStabilityOnlySlots?: string[];
}

const BLUEPRINTS: Blueprint[] = [
  {
    name: 'LOWER CROSS',
    tight: [
      { muscle: 'hip flexors', canonicalLabel: 'hip flexors' },
      { muscle: 'TFL', canonicalLabel: null },
      { muscle: 'lumbar erectors', canonicalLabel: 'lumbar erectors' },
    ],
    long: [
      { muscle: 'glutes', canonicalLabel: 'glutes' },
      { muscle: 'hamstrings', canonicalLabel: 'hamstrings' },
      { muscle: 'deep abdominals (TVA)', canonicalLabel: 'deep abdominals (TVA)' },
    ],
    coreStabilityOnlySlots: ['deep abdominals (TVA)'],
  },
  {
    name: 'UPPER CROSS',
    tight: [
      { muscle: 'pecs', canonicalLabel: 'pecs' },
      { muscle: 'upper traps', canonicalLabel: 'upper traps' },
      { muscle: 'lats', canonicalLabel: 'lats' },
      { muscle: 'levator scapulae', canonicalLabel: null },
    ],
    long: [
      { muscle: 'deep neck flexors', canonicalLabel: null },
      { muscle: 'lower/mid traps', canonicalLabel: 'lower traps' },
      { muscle: 'rhomboids', canonicalLabel: 'rhomboids' },
      { muscle: 'serratus anterior', canonicalLabel: 'serratus anterior' },
    ],
  },
  {
    name: 'FORWARD HEAD',
    tight: [
      { muscle: 'suboccipitals', canonicalLabel: null },
      { muscle: 'upper traps', canonicalLabel: 'upper traps' },
      { muscle: 'SCM/scalenes', canonicalLabel: 'SCM' },
      { muscle: 'chest', canonicalLabel: 'pecs' },
    ],
    long: [
      { muscle: 'deep neck flexors', canonicalLabel: null },
      { muscle: 'thoracic extensors', canonicalLabel: null },
    ],
  },
  {
    name: 'FLAT BACK',
    tight: [
      { muscle: 'hamstrings', canonicalLabel: 'hamstrings' },
      { muscle: 'glutes', canonicalLabel: 'glutes' },
      { muscle: 'abdominals', canonicalLabel: 'abdominals' },
    ],
    long: [
      { muscle: 'hip flexors', canonicalLabel: 'hip flexors' },
      { muscle: 'lumbar erectors', canonicalLabel: 'lumbar erectors' },
    ],
  },
];

function countTight(entries: Entry[], label: string | null) {
  if (!label) return { release: 0, stretch: 0, mobility: 0 };
  const has = (e: Entry, role: CorrectiveRole) =>
    e.correctiveRoles.includes(role) && e.musclesStretched.includes(label);
  return {
    release: entries.filter((e) => has(e, 'release')).length,
    stretch: entries.filter((e) => has(e, 'stretch')).length,
    mobility: entries.filter((e) => has(e, 'mobility')).length,
  };
}

function countLong(entries: Entry[], label: string | null, coreStabilityOnly: boolean) {
  if (!label) return { strengthenStabilize: 0, coreStability: 0 };
  const coreStability = entries.filter(
    (e) => e.correctiveRoles.includes('core_stability') && e.musclesStrengthened.includes(label)
  ).length;
  if (coreStabilityOnly) return { strengthenStabilize: 0, coreStability };
  const strengthenStabilize = entries.filter(
    (e) =>
      e.musclesStrengthened.includes(label) &&
      (e.correctiveRoles.includes('strength') ||
        e.correctiveRoles.includes('stability') ||
        e.correctiveRoles.includes('power'))
  ).length;
  return { strengthenStabilize, coreStability };
}

function main() {
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8')) as Report;
  const entries = report.entries;

  let md = `# Corrective blueprint gap check\n\n`;
  md += `Generated from \`docs/exercise-media/corrective-metadata-report.json\` (${entries.length} classified exercises) against the 4 corrective blueprints. "canonicalLabel: none" means the muscle has no matching label anywhere in the catalog's classified muscle data at all — a structural gap, not just a thin one.\n\n`;

  const zeroSlots: string[] = [];
  const thinSlots: string[] = [];

  for (const bp of BLUEPRINTS) {
    md += `## ${bp.name}\n\n`;
    md += `### Tight (release / stretch / mobilize)\n\n`;
    md += `| Muscle | Release options | Stretch options | Mobility options |\n|---|---|---|---|\n`;
    for (const slot of bp.tight) {
      const counts = countTight(entries, slot.canonicalLabel);
      md += `| ${slot.muscle} | ${counts.release} | ${counts.stretch} | ${counts.mobility} |\n`;
      const total = counts.release + counts.stretch + counts.mobility;
      const label = `${bp.name} — tight — ${slot.muscle}`;
      if (!slot.canonicalLabel || total === 0) zeroSlots.push(label);
      else if (total < 5) thinSlots.push(`${label} (${total})`);
    }
    md += `\n### Long (strengthen / stabilize)\n\n`;
    md += `| Muscle | Strengthen/stabilize options | Core-stability (non-flexion) options |\n|---|---|---|\n`;
    for (const slot of bp.long) {
      const coreOnly = bp.coreStabilityOnlySlots?.includes(slot.muscle) ?? false;
      const counts = countLong(entries, slot.canonicalLabel, coreOnly);
      md += `| ${slot.muscle}${coreOnly ? ' (core_stability only)' : ''} | ${coreOnly ? '—' : counts.strengthenStabilize} | ${counts.coreStability} |\n`;
      const total = coreOnly ? counts.coreStability : counts.strengthenStabilize;
      const label = `${bp.name} — long — ${slot.muscle}`;
      if (!slot.canonicalLabel || total === 0) zeroSlots.push(label);
      else if (total < 5) thinSlots.push(`${label} (${total})`);
    }
    md += `\n`;
  }

  md += `## Zero-coverage slots (${zeroSlots.length})\n\n`;
  md += zeroSlots.length ? zeroSlots.map((s) => `- ${s}`).join('\n') + '\n\n' : '- None\n\n';
  md += `## Thin-coverage slots, <5 options (${thinSlots.length})\n\n`;
  md += thinSlots.length ? thinSlots.map((s) => `- ${s}`).join('\n') + '\n\n' : '- None\n\n';

  writeFileSync(OUTPUT_PATH, md);
  console.log(`Zero-coverage slots: ${zeroSlots.length}`);
  for (const s of zeroSlots) console.log(`  - ${s}`);
  console.log(`Thin-coverage slots (<5): ${thinSlots.length}`);
  for (const s of thinSlots) console.log(`  - ${s}`);
  console.log(`Report: ${OUTPUT_PATH}`);
}

main();
