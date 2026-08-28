/**
 * What she sees between the tap and Home's first streamed response.
 *
 * Home-shaped rather than the app's generic `PageSkeleton`: Home's hero is
 * a 440px full-bleed band, and swapping a light three-card page for it a
 * moment later moves the whole screen. See
 * components/dashboard/HomePlaceholders.tsx.
 */
import { HomeShellPlaceholder } from '@/components/dashboard/HomePlaceholders';
import { MemberBottomNav } from '@/components/MemberBottomNav';

export default function Loading() {
  return (
    <>
      <HomeShellPlaceholder />
      {/* The nav is real and already tappable, so it does not flash. Its
          coach link is the one thing this cannot know yet, and a member's
          nav is the honest default for a screen that is about to be one. */}
      <MemberBottomNav isCoach={false} />
    </>
  );
}
