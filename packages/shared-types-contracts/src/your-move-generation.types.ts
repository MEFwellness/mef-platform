/**
 * Coach-side workout/program generation via Your Move's /workouts/generate
 * and /programs/generate endpoints (supabase/migrations/
 * 00000000000122_your_move_generation_log.sql). Same convention as every
 * other *.types.ts file here: hand-authored, row/type contracts only —
 * logic lives in apps/consumer-web-app/lib/your-move/generation.ts.
 *
 * A generated draft is never persisted as its own row — it lives in the
 * coach's browser session (or a server action's return value) until
 * explicitly saved, at which point it becomes ordinary
 * CoachProgramTemplate content (coach-program-builder.types.ts). Only the
 * fact that generation happened, and what was requested, is logged here.
 */

export type YourMoveGenerationKind = 'workout' | 'program';
export type YourMoveGenerationStatus = 'success' | 'error';

export interface YourMoveGenerationLog {
  id: string;
  coach_id: string;
  kind: YourMoveGenerationKind;
  request_params: Record<string, unknown>;
  status: YourMoveGenerationStatus;
  error_code: string | null;
  error_message: string | null;
  result_summary: Record<string, unknown>;
  saved_template_ids: string[];
  created_at: string;
}
