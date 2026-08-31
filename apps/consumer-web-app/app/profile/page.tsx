import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ClipboardList, ChevronRight, TrendingUp, Watch, ScanFace, User, KeyRound } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { SignOutButton } from '@/components/SignOutButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildProfileEntryContext } from '@/lib/conversation-coach/entryContext';
import { firstNameFrom } from '@/lib/profile/greeting';
import { ProfileForm } from './ProfileForm';
import { PasskeyEnrollment } from './PasskeyEnrollment';
import { Card } from '@/components/layout';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { LockedCardButton } from '@/components/locked/LockedCardButton';
import { lockNoteMessage, lockOffersPlanLink } from '@/lib/locked-content/copy';
import { LockedBadge } from '@/components/locked/LockedBadge';
import { memberProfileCore } from '@/lib/member/profileCore';
import { getMemberPushState } from '@/lib/push/data';
import { NotificationsPreferenceSwitch } from '@/components/push/NotificationsPreferenceSwitch';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function ProfilePage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [profile, isCoach, bodyAssessmentAccess, pushState] = await Promise.all([
    memberProfileCore(supabase, user.id),
    hasActiveRole(supabase, user.id, 'coach'),
    // Locks the "Assessments" card below when this member's plan does not
    // include the Body Assessment and no coach has assigned it. 'view',
    // because this card is a doorway to her own stored assessments, and
    // her own history is never hidden by a plan rule.
    checkAssessmentAccess(supabase, user.id, 'body-assessment', { intent: 'view' }),
    // Her single reminders preference. Read here rather than inside the
    // switch so the screen renders with the real value already in it and
    // never flickers from off to on after mount.
    getMemberPushState(supabase, user.id),
  ]);

  const firstName = firstNameFrom(profile.displayName);

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
            displayName={profile.displayName ?? ''}
            timezone={profile.timezone ?? 'America/New_York'}
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
            <LockedCardButton
              ariaLabel="Assessments, locked. Tap to hear from Root about it."
              analyticsFeature="body-assessment"
              message={lockNoteMessage(bodyAssessmentAccess.reason)}
              lockReason={bodyAssessmentAccess.reason.kind}
              planHref={lockOffersPlanLink(bodyAssessmentAccess.reason) ? '/membership' : undefined}
            >
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
            <LockedBadge />
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
          <div className="mt-4 border-t border-[#1B3A2D]/10 pt-4">
            <Link
              href={'/account/password' as Route}
              className="mef-press flex items-center justify-between rounded-2xl border border-[#1B3A2D]/10 px-4 py-3 transition hover:border-[#1B3A2D]/30"
            >
              <span className="flex items-center gap-2.5 text-[15px] font-medium text-[#1B3A2D]">
                <KeyRound className="h-4 w-4 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
                Change password
              </span>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-[#1B3A2D]/40"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Link>
          </div>
          <div className="mt-4 border-t border-[#1B3A2D]/10 pt-4">
            <NotificationsPreferenceSwitch enabled={pushState.enabled} />
          </div>
          <div className="mt-4 border-t border-[#1B3A2D]/10 pt-4">
            <PasskeyEnrollment />
          </div>
          <div className="mt-4">
            <SignOutButton variant="block" />
          </div>
        </Card>
      </main>

      <MemberBottomNav isCoach={isCoach} />

      <FloatingCoachLauncher entryPoint="profile" entryContext={buildProfileEntryContext()} />
    </div>
  );
}
