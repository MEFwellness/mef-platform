/**
 * The coach assignment a HAQ instance now needs (migration 263), for the
 * integration tests that drive the real database.
 *
 * A member opens her own HAQ instance only on a pending coach assignment, so
 * every test that starts one first has a coach assign it, exactly as the
 * product does. Completing an instance closes that assignment (migrations
 * 100 and 144), which is why a test that starts a second instance asks for a
 * fresh one first.
 */
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { HAQ_DEFINITION_ID } from '../lib/haq/constants';

/** A pending HAQ assignment for this member, from the seeded coach. An open one already there is kept. */
export async function ensurePendingHaqAssignment(memberId: string): Promise<string> {
  const service = serviceRoleClient();
  const { data: open } = await service
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', HAQ_DEFINITION_ID)
    .eq('status', 'pending')
    .maybeSingle();
  if (open) return open.id as string;

  const { data, error } = await service
    .from('assessment_assignments')
    .insert({
      member_id: memberId,
      assessment_definition_id: HAQ_DEFINITION_ID,
      assigned_by: TEST_USERS.coachOne.id,
      is_required: true,
      stage: 'standard',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Could not assign the HAQ: ${error?.message}`);
  return data.id as string;
}

/** Every HAQ assignment and attempt row for these members, so each test starts from nothing assigned. */
export async function clearHaqLedger(memberIds: string[]): Promise<void> {
  const service = serviceRoleClient();
  const { error: assignmentError } = await service
    .from('assessment_assignments')
    .delete()
    .in('member_id', memberIds)
    .eq('assessment_definition_id', HAQ_DEFINITION_ID);
  if (assignmentError) throw new Error(assignmentError.message);
  const { error: attemptError } = await service
    .from('assessment_attempts')
    .delete()
    .in('member_id', memberIds)
    .eq('assessment_definition_id', HAQ_DEFINITION_ID);
  if (attemptError) throw new Error(attemptError.message);
}
