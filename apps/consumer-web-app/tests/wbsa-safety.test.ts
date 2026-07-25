/**
 * WBSA safety escalation — proves escalateWbsaRedFlags (lib/wbsa/safety.ts)
 * really calls the existing Safety Escalation System
 * (lib/safety/service.ts::evaluateConcern) against real local Supabase,
 * the same way app/actions/body-assessment.ts already does for a
 * 'significant' posture finding. Two cases: one WBSA red-flag question
 * whose honest description genuinely matches an existing keyword category
 * (chest pain), and one that doesn't (GI bleeding) — proving the
 * newOrWorseningConcern fallback still opens an auditable classification
 * even without a keyword hit.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { escalateWbsaRedFlags, isWbsaConcerningFinding } from '../lib/wbsa/safety';

const memberId = TEST_USERS.memberOne.id;
const fakeSessionId = '99999999-9999-9999-9999-999999999901';

afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('safety_review_queue').delete().eq('member_id', memberId);
  await service.from('safety_acknowledgments').delete().eq('member_id', memberId);
  await service.from('safety_audit_log').delete().eq('member_id', memberId);
  await service.from('safety_classifications').delete().eq('member_id', memberId);
  await service.from('member_narrative_entries').delete().eq('member_id', memberId).eq('source_feature', 'safety_classifications');
});

describe('lib/wbsa/safety — isWbsaConcerningFinding', () => {
  it('mirrors body-assessment: only significant severity at real confidence qualifies', () => {
    expect(isWbsaConcerningFinding('significant', 0.75)).toBe(true);
    expect(isWbsaConcerningFinding('significant', 0.5)).toBe(false);
    expect(isWbsaConcerningFinding('moderate', 0.9)).toBe(false);
    expect(isWbsaConcerningFinding('mild', 0.9)).toBe(false);
  });
});

describe('lib/wbsa/safety — escalateWbsaRedFlags against real Supabase', () => {
  it('a chest-pain red flag escalates through the real keyword classifier at critical urgency and opens a coach review', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const result = await escalateWbsaRedFlags(client, memberId, fakeSessionId, [
      { questionKey: 'wbsa_resp_redflag_chest', label: 'Chest pain question', severity: 'significant' },
    ]);
    expect(result.escalated).toBe(true);

    const service = serviceRoleClient();
    const { data: classifications } = await service
      .from('safety_classifications')
      .select('*')
      .eq('member_id', memberId)
      .eq('source_feature', 'unified_assessment');
    expect(classifications).toHaveLength(1);
    expect(classifications![0].classification_level).toBe('safety_response_only');
    expect(classifications![0].source_record_id).toBe(fakeSessionId);

    const { data: reviewQueue } = await service
      .from('safety_review_queue')
      .select('*')
      .eq('member_id', memberId);
    expect(reviewQueue!.length).toBeGreaterThan(0);
  }, 20000);

  it('a red flag with no matching keyword category still escalates via the newOrWorseningConcern fallback', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const result = await escalateWbsaRedFlags(client, memberId, fakeSessionId, [
      { questionKey: 'wbsa_lowdig_redflag_bleeding', label: 'GI bleeding question', severity: 'significant' },
    ]);
    expect(result.escalated).toBe(true);

    const service = serviceRoleClient();
    const { data: classifications } = await service
      .from('safety_classifications')
      .select('classification_level, reasoning_codes')
      .eq('member_id', memberId)
      .eq('source_feature', 'unified_assessment');
    expect(classifications).toHaveLength(1);
    expect(classifications![0]!.reasoning_codes).toContain('NEW_OR_WORSENING_CONCERN_FLAGGED');
  }, 20000);

  it('a mild or moderate finding never escalates, even for a red-flag question key', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const result = await escalateWbsaRedFlags(client, memberId, fakeSessionId, [
      { questionKey: 'wbsa_resp_redflag_chest', label: 'Chest pain question', severity: 'moderate' },
    ]);
    expect(result.escalated).toBe(false);

    const service = serviceRoleClient();
    const { data: classifications } = await service
      .from('safety_classifications')
      .select('id')
      .eq('member_id', memberId)
      .eq('source_feature', 'unified_assessment');
    expect(classifications).toHaveLength(0);
  }, 20000);

  it('a finding on a question not in the WBSA red-flag list is ignored entirely', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const result = await escalateWbsaRedFlags(client, memberId, fakeSessionId, [
      { questionKey: 'wbsa_updig_fullness', label: 'Not a red flag', severity: 'significant' },
    ]);
    expect(result.escalated).toBe(false);
  }, 20000);
});
