import { ShieldCheck } from 'lucide-react';
import type { MemberMovementProfile } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function TagRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full bg-[#EFF6F1] px-3 py-1.5 text-xs font-medium text-[#1B3A2D]"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Read-only — everything here is coach-controlled (migration 81's upsert_movement_profile_coach_fields); a member sees it but can never edit it from this page. */
export function MovementProfileCoachSummary({ profile }: { profile: MemberMovementProfile }) {
  const hasAnyCoachContent =
    profile.movement_limitations.length > 0 ||
    profile.exercise_restrictions.length > 0 ||
    profile.corrective_priorities.length > 0 ||
    Boolean(profile.exercise_clearance) ||
    Boolean(profile.coach_observations);

  if (!hasAnyCoachContent) return null;

  return (
    <div className={`${CARD} space-y-4 p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">From your coach</p>
      </div>

      <TagRow label="Movement limitations" values={profile.movement_limitations} />
      <TagRow label="Exercise restrictions" values={profile.exercise_restrictions} />
      <TagRow label="Corrective priorities" values={profile.corrective_priorities} />

      {profile.exercise_clearance && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Exercise clearance
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{profile.exercise_clearance}</p>
        </div>
      )}

      {profile.coach_observations && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Coach observations
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{profile.coach_observations}</p>
        </div>
      )}
    </div>
  );
}
