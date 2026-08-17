/**
 * Movement Profile — the permanent movement record every Program, Root
 * recommendation, Progress view, and Coach tool reads from (migration 81).
 * The goals/equipment/priorities half is editable here; anything
 * coach-authored (limitations, restrictions, clearance) is shown read-only
 * — see MovementProfileCoachSummary's own doc comment for why.
 *
 * COACH AND ADMINISTRATOR ONLY, and this screen shows the signed-in
 * account's OWN record. A coach editing a CLIENT's Movement Profile does
 * it where the rest of that client's record lives, on
 * app/coach/clients/[id] (MovementProfilePanel) — that panel is untouched
 * by this change and is still the real per-client tool.
 *
 * See lib/auth/staffRouting.ts's STAFF_ONLY_PREFIXES for why this left the
 * member app, and lib/auth/staffOnlyPage.ts for the server-side half of
 * the gate middleware.ts also enforces.
 */

import type { Route } from 'next';
import { Compass } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { StaffNav } from '@/components/StaffNav';
import { requireStaffForInternalTool } from '@/lib/auth/staffOnlyPage';
import { BackButton } from '@/components/BackButton';
import { getOrCreateMovementProfile } from '@/lib/movement-profile/data';
import { MovementProfileForm } from '@/components/movement-profile/MovementProfileForm';
import { MovementProfileCoachSummary } from '@/components/movement-profile/MovementProfileCoachSummary';

export default async function MovementProfilePage() {
  const { isCoach, isAdmin } = await requireStaffForInternalTool();

  const supabase = createClient();
  const user = await getCachedUser();
  const profile = user ? await getOrCreateMovementProfile(supabase, user.id) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref={(isCoach ? '/coach' : '/admin') as Route} label="Back" forceFallback />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Movement Profile</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Movement Profile
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            The record movement recommendations are built from: goals, equipment, and priorities,
            plus anything a coach has added. To edit a client&apos;s profile, open that client from
            the coach dashboard.
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
            Could not load this Movement Profile. Please try again.
          </div>
        )}
      </main>

      <StaffNav isCoach={isCoach} isAdmin={isAdmin} />
    </div>
  );
}
