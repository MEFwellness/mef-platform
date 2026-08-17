/**
 * The member bar, with its Food Lens tab decided by the Visibility Layer.
 *
 * A server component wrapping the unchanged presentational
 * components/BottomNav.tsx, for one reason: the bar is on every member
 * screen, so a tab in it is the single most persistent advertisement in the
 * app, and this build's rule is that no screen may advertise a feature the
 * member's own rules have not revealed. Deciding that needs a server read,
 * and BottomNav is a client component because it reads the current path.
 *
 * `getMemberVisibility()` is request-memoized, so on Home, Today and
 * Progress (which already ask it) this costs nothing at all, and on every
 * other screen it is one gather.
 *
 * Staff accounts short-circuit before any visibility read: they get
 * StaffNav, so there is no member tab to decide.
 */

import { BottomNav } from '@/components/BottomNav';
import { getMemberVisibility } from '@/lib/visibility';
import { F } from '@/lib/visibility/catalog';

export async function MemberBottomNav({
  isCoach = false,
  isAdmin = false,
}: {
  isCoach?: boolean;
  isAdmin?: boolean;
}) {
  if (isCoach || isAdmin) return <BottomNav isCoach={isCoach} isAdmin={isAdmin} />;

  const visibility = await getMemberVisibility();
  const showFoodLens = visibility.byKey.get(F.trackerFoodLens)?.visible ?? false;

  return <BottomNav showFoodLens={showFoodLens} />;
}
