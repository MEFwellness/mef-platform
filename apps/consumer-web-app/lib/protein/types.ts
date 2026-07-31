/**
 * Protein Phase 1a — types for member_protein_profile and
 * member_protein_targets (migration 133). No food entry/ledger/photo
 * estimate concepts here — this phase only covers profile setup, the
 * safety screen, target calculation, and coach approval.
 */

export type ActivityLevelKey =
  | 'general_wellness'
  | 'regular_movement'
  | 'resistance_training_or_fat_loss'
  | 'muscle_building_emphasis';

export type ProteinTrack = 'structured_program' | 'self_guided';

export type ProteinTargetStatus = 'pending_coach_review' | 'active';

export type ProteinProfile = {
  memberId: string;
  bodyWeightLb: number;
  activityLevel: ActivityLevelKey;
  updatedAt: string;
};

export type ProteinTarget = {
  id: string;
  memberId: string;
  track: ProteinTrack;
  bodyWeightLb: number;
  activityLevel: ActivityLevelKey;
  computedGrams: number;
  status: ProteinTargetStatus;
  activeGrams: number | null;
  isCoachEdited: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

/** One row per pending item in the coach approval queue, with the member's display name already joined in. */
export type PendingProteinTargetQueueEntry = ProteinTarget & {
  memberName: string;
};
