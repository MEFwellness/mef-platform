import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, ChevronRight, TrendingUp, Watch, ScanFace, User } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { SignOutButton } from '@/components/SignOutButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildProfileEntryContext } from '@/lib/conversation-coach/entryContext';
import { firstNameFrom } from '@/lib/profile/greeting';
import { ProfileForm } from './ProfileForm';
import { Card } from '@/components/layout';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { LockedCardButton } from '@/components/locked/LockedCardButton';
import { CoachLockBadge } from '@/components/locked/CoachLockBadge';

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, isCoach, bodyAssessmentAccess] = await Promise.all([
    supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
    // Coach-Assign-Only Gating task (2026-08-04) — locks the "Assessments"
    // card below when this member has no Body Assessment history and no
    // pending coach assignment for it.
    checkAssessmentAccess(supabase, user.id, 'body-assessment'),
  ]);

  const firstName = firstNameFrom(profile?.display_name);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" />

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[#F5B700] bg-white text-lg font-medium text-[#1B3A2D]">
            {firstName ? (
              firstName.charAt(0).toUpperCase()
            ) : (
              <User className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            )}
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
              Profile
            </h1>
            <p className="text-[15px] text-[#6B7A72]">{user.email}</p>
          </div>
        </div>

        <Card className="mt-7">
          <ProfileForm
            displayName={profile?.display_name ?? ''}
            timezone={profile?.timezone ?? 'America/New_York'}
          />
        </Card>

        <Card
          as={Link}
          href="/profile/baseline"
          lift
          className="mt-5 flex items-center justify-between transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]"
        >
          <div>
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Baseline Assessment</p>
            </div>
            <p className="mt-1.5 text-sm text-[#6B7A72]">
              Review the onboarding assessment you completed when you first joined.
            </p>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-[#1B3A2D]/40"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Card>

        <Card
          as={Link}
          href="/profile/reassessments"
          lift
          className="mt-5 flex items-center justify-between transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]"
        >
          <div>
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">
                Progress & Reassessments
              </p>
            </div>
            <p className="mt-1.5 text-sm text-[#6B7A72]">
              Compare your latest reassessment against your baseline and start a new one.
            </p>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-[#1B3A2D]/40"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Card>

        {/* Assessments no longer has its own bottom-nav tab (Premium UX
            Milestone 1) — this and the Progress page card are its two
            remaining entry points; the feature itself is unchanged. */}
        {bodyAssessmentAccess.allowed ? (
          <Card
            as={Link}
            href="/assessment"
            lift
            className="mt-5 flex items-center justify-between transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]"
          >
            <div>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Assessments</p>
              </div>
              <p className="mt-1.5 text-sm text-[#6B7A72]">
                Guided posture and movement assessments your coach reviews.
              </p>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-[#1B3A2D]/40"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Card>
        ) : (
          <div className="relative mt-5">
            <LockedCardButton ariaLabel="Assessments, locked. Tap to hear from Root about it.">
              <Card className="opacity-55 grayscale-[0.4]">
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Assessments</p>
                </div>
                <p className="mt-1.5 text-sm text-[#6B7A72]">
                  Guided posture and movement assessments your coach reviews.
                </p>
              </Card>
            </LockedCardButton>
            <CoachLockBadge />
          </div>
        )}

        <Card
          as={Link}
          href="/connections"
          lift
          className="mt-5 flex items-center justify-between transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]"
        >
          <div>
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <Watch className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Connected Devices</p>
            </div>
            <p className="mt-1.5 text-sm text-[#6B7A72]">
              Connect Oura, Apple Health, or Google Fit to personalize your coaching.
            </p>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-[#1B3A2D]/40"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Card>

        <Card className="mt-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Account</p>
          <p className="mt-2 text-sm text-[#6B7A72]">
            Signed in as <span className="text-[#1B3A2D]">{user.email}</span>
          </p>
          <div className="mt-4">
            <SignOutButton variant="block" />
          </div>
        </Card>
      </main>

      <BottomNav isCoach={isCoach} />

      <FloatingCoachLauncher entryPoint="profile" entryContext={buildProfileEntryContext()} />
    </div>
  );
}
