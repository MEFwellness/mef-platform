/**
 * Coach question-bank management — types shared between the data layer
 * (data.ts), server actions (app/actions/driverProbeAdmin.ts), and the
 * coach screen (components/coach/QuestionBankPanel.tsx).
 */

import type { Rule } from '../adaptive-assessment-engine/types';
import type { DriverProbeQuestion, ProbeOption, ProbeResponseType, ProbeScreen } from '../daily-checkin-adaptive/types';

/** A driver_probe_questions row plus the usage stats the list screen needs to answer "has anyone ever seen this?" */
export type QuestionWithStats = DriverProbeQuestion & {
  /** Distinct (member, date) days this question was part of a recorded plan — always accurate for rotating probes (driver_id set); not tracked for local follow-ups (driver_id null), which are never entered into member_daily_probe_selections by design (lib/daily-checkin-adaptive/probeBank.ts excludes them from the server-side bank entirely). `null` means "not tracked for this question shape", not zero. */
  askedCount: number | null;
  /** Real recorded answers — from daily_checkin_probe_answers for storage='probe_answer' rows, or a non-null count on the relevant daily_checkins column for storage='daily_checkins_column' rows. This is the number that gates the response_type/options lock. */
  answeredCount: number;
};

export type CreateQuestionInput = {
  questionKey: string;
  driverId: string;
  prompt: string;
  responseType: ProbeResponseType;
  options: ProbeOption[];
  screen: ProbeScreen;
};

/** Only prompt/driverId/screen are ever safe to change once a question has recorded answers — see UpdateQuestionResult. Each field explicitly allows `| undefined` (not just omission) so a caller can say "leave this locked field alone" without tripping exactOptionalPropertyTypes. */
export type UpdateQuestionInput = {
  prompt?: string | undefined;
  driverId?: string | undefined;
  screen?: ProbeScreen | undefined;
  responseType?: ProbeResponseType | undefined;
  options?: ProbeOption[] | undefined;
  requires?: Rule[] | undefined;
};

export type UpdateQuestionResult =
  | { ok: true }
  | { ok: false; error: string; lockedFields?: ('responseType' | 'options')[] };

export type RevisionEntry = {
  id: string;
  questionKey: string;
  changeType: 'created' | 'updated' | 'retired' | 'restored';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedBy: string;
  changedByName: string;
  changedAt: string;
};
