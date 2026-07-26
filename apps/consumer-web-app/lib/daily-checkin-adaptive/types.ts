import type { Rule } from '../adaptive-assessment-engine/types';

export type ProbeResponseType = 'scale' | 'single_select' | 'time_pair' | 'count' | 'boolean';
export type ProbeStorage = 'daily_checkins_column' | 'probe_answer';
export type ProbeScreen = 'morning' | 'evening';

/** An option for scale/count (a bare number) or single_select — either the richer {value,label} shape newer rows use, or a bare string (the shape the original 2 seeded single_select rows still use). DriverProbeField renders all three. */
export type ProbeOption = string | number | { value: string; label: string };

export type DriverProbeQuestion = {
  questionKey: string;
  driverId: string | null;
  prompt: string;
  responseType: ProbeResponseType;
  options: ProbeOption[];
  storage: ProbeStorage;
  dailyCheckinsColumn: string | null;
  wearableMetricCode: string | null;
  requires: Rule[];
  excludes: Rule[];
  priority: number;
  active: boolean;
  /** Which check-in surface this question belongs on — Morning Readiness or Evening Reflection (migration 109). */
  screen: ProbeScreen;
};

export type TodaysCheckinPlan = {
  localDate: string;
  fixedCoreQuestionKeys: readonly string[];
  /** The rotating driver-probe questions selected for today — empty entries mean nothing eligible remained (every mapped driver ruled out, or a wearable already supplies every candidate). */
  rotatingProbes: DriverProbeQuestion[];
};
