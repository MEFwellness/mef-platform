/**
 * Movement Profile — the permanent movement record every future Program,
 * Root recommendation, Progress view, and Coach tool reads from (migration
 * 81). A member edits their own goals/equipment/priorities here; anything
 * coach-authored (limitations, restrictions, clearance) is shown read-only
 * — see MovementProfileCoachSummary's own doc comment for why.
 */

import { redirect } from 'next/navigation';
import { Compass } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { getOrCreateMovementProfile } from '@/lib/movement-profile/data';
import { MovementProfileForm } from '@/components/movement-profile/MovementProfileForm';
import { MovementProfileCoachSummary } from '@/components/movement-profile/MovementProfileCoachSummary';

export default async function MovementProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  const profile = await getOrCreateMovementProfile(supabase, user.id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/movement" label="Movement" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Movement Profile</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Your Movement Profile
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            The foundation for how MEF Wellness recommends movement for you — goals, equipment,
            and priorities you control, plus anything your coach has added.
          </p>
        </div>

        {profile ? (
          <div className="mt-7 space-y-5">
            <MovementProfileCoachSummary profile={profile} />
            <MovementProfileForm
              initialGoals={profile.goals}
              initialEquipmentAccess={profile.equipment_access}
              initialMobilityPriorities={profile.mobility_priorities}
              initialStabilityPriorities={profile.stability_priorities}
              initialStrengthPriorities={profile.strength_priorities}
            />
          </div>
        ) : (
          <div className="mt-7 rounded-2xl border border-dashed border-[#1B3A2D]/15 px-4 py-6 text-center text-sm text-[#6B7A72]">
            Could not load your Movement Profile. Please try again.
          </div>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
