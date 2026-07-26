/**
 * Case View — the investigation panel (requirement 2). Pure, no I/O.
 * Reuses lib/driver-library/weighting.ts's realWeightingGoals (not
 * reinvented) to decide which drivers are relevant to her goals, exactly
 * the same rule the daily check-in's own picker already uses.
 */

import { realWeightingGoals } from '../driver-library/weighting';
import type { Driver, DriverGoalWeight, MemberDriverState } from '../driver-library/types';
import type { CandidatePair } from '../correlation-engine/types';
import type { DriverCaseView, InvestigationPanelView } from './types';

function isRelevant(driver: Driver, realGoals: string[], goalWeights: readonly DriverGoalWeight[]): boolean {
  if (realGoals.length === 0) return true; // broad sampling — Part 3's "understand my body" / no-goal fallback
  const realGoalSet = new Set(realGoals);
  return goalWeights.some((w) => w.driverId === driver.id && realGoalSet.has(w.goalKey));
}

export function buildInvestigationPanel(
  drivers: readonly Driver[],
  domainLabelByKey: ReadonlyMap<string, string>,
  goalWeights: readonly DriverGoalWeight[],
  memberGoalKeys: readonly string[],
  driverStates: ReadonlyMap<string, MemberDriverState>,
  candidatePairs: readonly CandidatePair[]
): InvestigationPanelView {
  const realGoals = realWeightingGoals(memberGoalKeys);
  const driverIdsWithPathway = new Set(candidatePairs.map((p) => p.driverId));

  const panel: InvestigationPanelView = {
    beingLookedAt: [],
    ruledOut: [],
    likelyInvolved: [],
    notYetTrackable: [],
  };

  for (const driver of drivers) {
    if (!isRelevant(driver, realGoals, goalWeights)) continue;

    const view: DriverCaseView = {
      driverId: driver.id,
      label: driver.label,
      domainLabel: domainLabelByKey.get(driver.domainKey) ?? driver.domainKey,
      state: driverStates.get(driver.id)?.state ?? 'unknown',
    };

    if (!driverIdsWithPathway.has(driver.id)) {
      panel.notYetTrackable.push(view);
      continue;
    }

    if (view.state === 'implicated') panel.likelyInvolved.push(view);
    else if (view.state === 'ruled_out') panel.ruledOut.push(view);
    else panel.beingLookedAt.push(view); // 'unknown' or 'watching', both still open
  }

  return panel;
}
