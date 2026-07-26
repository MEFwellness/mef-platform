import type { Rule } from '../adaptive-assessment-engine/types';

export type ProbeResponseType = 'scale' | 'single_select' | 'time_pair' | 'count' | 'boolean';
export type ProbeStorage = 'daily_checkins_column' | 'probe_answer';

export type DriverProbeQuestion = {
  questionKey: string;
  driverId: string | null;
  prompt: string;
  responseType: ProbeResponseType;
  options: unknown[];
  storage: ProbeStorage;
  dailyCheckinsColumn: string | null;
  wearableMetricCode: string | null;
  requires: Rule[];
  excludes: Rule[];
  priority: number;
  active: boolean;
};

export type TodaysCheckinPlan = {
  localDate: string;
  fixedCoreQuestionKeys: readonly string[];
  /** The rotating driver-probe questions selected for today — empty entries mean nothing eligible remained (every mapped driver ruled out, or a wearable already supplies every candidate). */
  rotatingProbes: DriverProbeQuestion[];
};
