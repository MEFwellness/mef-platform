/** Forecast & Calibration Loop — the ending screen's view model. */

export type ScoredForecastView = {
  predictedLevel: number;
  predictedLabel: string;
  actualLevel: number;
  actualLabel: string;
  gap: number;
  sentence: string;
};

export type RootStatusView =
  | { kind: 'not_ready'; basisObservationCount: number; minRequired: number; sentence: string }
  | { kind: 'too_volatile'; basisObservationCount: number; sentence: string }
  | { kind: 'no_attempt'; sentence: string }
  | { kind: 'scored'; forecast: ScoredForecastView };

export type CalibrationPoint = { date: string; herAccuracyPct: number; rootAccuracyPct: number };

export type CalibrationView = {
  scoredCount: number;
  herAccuracyPct: number;
  rootAccuracyPct: number;
  series: CalibrationPoint[];
};

export type ReadbackView = {
  moodLabel: string | null;
  energyLabel: string | null;
  stressLabel: string | null;
  sleepQualityLabel: string | null;
  painLabel: string | null;
};

export type TimelineView = {
  checkinCount: number;
  daysSinceFirstCheckin: number | null;
  targetDays: number;
  sentence: string;
};

export type EndingScreenView =
  | {
      kind: 'no_forecast';
      readback: ReadbackView;
      timeline: TimelineView;
      rootStatus: RootStatusView;
    }
  | {
      kind: 'scored';
      her: ScoredForecastView;
      rootStatus: RootStatusView;
      calibration: CalibrationView | null;
      handoffToCase: boolean;
    };
