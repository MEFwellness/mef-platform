/**
 * The Test account label for a coach screen that holds a member id but
 * not the member's `is_test` flag.
 *
 * The alternative was threading a boolean through five overview builders
 * that have no other reason to know about it. This is a READ during a
 * render, which is allowed, and it is the same single flag every other
 * surface reads. It never writes anything.
 *
 * Renders nothing at all for a member who is not flagged, so a page can
 * place it unconditionally beside a name.
 */
import { createClient } from '@/lib/supabase/server';
import { TestAccountChip } from './TestAccountChip';

export async function MemberTestAccountChip({ memberId }: { memberId: string }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('is_test')
    .eq('id', memberId)
    .maybeSingle();
  // An unreadable profile row is not evidence of a fixture. Say nothing
  // rather than label a real member, which is the same direction
  // lib/staff/testAccounts.ts fails in.
  if (error || !data?.is_test) return null;
  return <TestAccountChip />;
}
