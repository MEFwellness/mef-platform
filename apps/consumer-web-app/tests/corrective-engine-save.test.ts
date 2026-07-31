/**
 * End-to-end guard test for the persistence side: real posture-assessment
 * findings -> detectCorrectivePatterns -> generateCorrectiveProgramDraft ->
 * saveCorrectiveProgramDraft, against real local Supabase (no mocks).
 * Proves:
 *   - the saved templates land in status 'pending_coach_review'
 *   - one template per weekly session, all sharing a program group tag
 *   - nothing becomes visible through the default coach template listing
 *     (the same query app/coach/programs/page.tsx uses) until a coach
 *     explicitly filters for pending_coach_review
 *   - no coach_program_assignments row is ever created (nothing auto-assigns)
 */
import { describe, it, expect, afterAll } from 'vitest';
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { getLatestCompletedPostureAssessment } from '../lib/corrective-engine/findings';
import { detectCorrectivePatterns } from '../lib/corrective-engine/patternMapping';
import { loadCorrectiveExercisePool } from '../lib/corrective-engine/exercisePool';
import { generateCorrectiveProgramDraft } from '../lib/corrective-engine/programGenerator';
import { saveCorrectiveProgramDraft } from '../lib/corrective-engine/save';
import { listCoachTemplates } from '../lib/coach-program-builder/templates';

const createdTemplateIds: string[] = [];
let createdAssessmentId: string | null = null;

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdTemplateIds.length > 0) {
    await supabase.from('coach_program_templates').delete().in('id', createdTemplateIds);
  }
  if (createdAssessmentId) {
    await supabase.from('body_assessments').delete().eq('id', createdAssessmentId);
  }
});

describe('corrective program generator — persistence', () => {
  it('reads real findings, generates, and saves a pending_coach_review draft with no auto-assignment', async () => {
    const supabase = serviceRoleClient();
    const memberId = TEST_USERS.memberOne.id;
    const coachId = TEST_USERS.coachOne.id;

    const { data: assessment, error: assessmentError } = await supabase
      .from('body_assessments')
      .insert({
        member_id: memberId,
        assessment_type: 'static_posture',
        status: 'analyzed',
        timezone: 'America/New_York',
        local_date: new Date().toISOString().slice(0, 10),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(assessmentError).toBeNull();
    createdAssessmentId = assessment!.id;

    const { error: findingError } = await supabase.from('body_assessment_findings').insert({
      assessment_id: assessment!.id,
      member_id: memberId,
      finding_type: 'lower_crossed_pattern',
      severity: 'moderate',
      status: 'confirmed',
    });
    expect(findingError).toBeNull();

    const latest = await getLatestCompletedPostureAssessment(supabase, memberId);
    expect(latest).not.toBeNull();
    const patterns = detectCorrectivePatterns(latest!.findings);
    expect(patterns).toEqual([
      { blueprint: 'lower_cross', severity: 'moderate', supportingFindingIds: [expect.any(String)] },
    ]);

    const pool = await loadCorrectiveExercisePool(supabase);
    const draft = generateCorrectiveProgramDraft({ patterns, daysPerWeek: 2, seed: 'persistence-test', pool });

    const saved = await saveCorrectiveProgramDraft(supabase, {
      draft,
      coachId,
      memberLabel: 'Test Member',
      memberId,
    });
    createdTemplateIds.push(...saved.templateIds);

    expect(saved.templateIds).toHaveLength(2);

    const { data: templates, error: templatesError } = await supabase
      .from('coach_program_templates')
      .select('*')
      .in('id', saved.templateIds);
    expect(templatesError).toBeNull();
    for (const template of templates!) {
      expect(template.status).toBe('pending_coach_review');
      expect(template.program_tags).toContain(saved.programGroupTag);
      expect(template.corrective_tags).toEqual(['lower_cross']);
    }

    // Default browse listing (same query the coach's Program Library page
    // uses) must not surface these until a coach explicitly asks for them.
    const defaultListing = await listCoachTemplates(supabase, coachId);
    expect(defaultListing.some((t) => saved.templateIds.includes(t.id))).toBe(false);

    const explicitListing = await listCoachTemplates(supabase, coachId, { status: 'pending_coach_review' });
    expect(saved.templateIds.every((id) => explicitListing.some((t) => t.id === id))).toBe(true);

    const { count: assignmentCount, error: assignmentError } = await supabase
      .from('coach_program_assignments')
      .select('*', { count: 'exact', head: true })
      .in('template_id', saved.templateIds);
    expect(assignmentError).toBeNull();
    expect(assignmentCount).toBe(0);
  });
});
