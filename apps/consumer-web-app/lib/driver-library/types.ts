/**
 * Driver Library (migration 106) — MEF-driver-library-v1.md loaded as
 * editable data instead of code. See ./data.ts (reads) and ./weighting.ts
 * (goal -> driver scoring). member_driver_states is written only by
 * lib/driver-state-engine/, not here.
 */

export type DriverState = 'unknown' | 'watching' | 'ruled_out' | 'implicated';

export type DriverDomain = {
  key: string;
  label: string;
  sortOrder: number;
};

export type Driver = {
  id: string;
  domainKey: string;
  label: string;
  whatItObserves: string;
  wearableObservable: boolean;
  postureDerived: boolean;
  sortOrder: number;
  active: boolean;
};

/** High/medium only — "Low" is the absence of a row (driver library, Part 2). */
export type DriverGoalWeight = {
  driverId: string;
  goalKey: string;
  weight: 'high' | 'medium';
};

export type MemberDriverState = {
  memberId: string;
  driverId: string;
  state: DriverState;
  evidenceSummary: Record<string, unknown>;
  updatedAt: string;
};
