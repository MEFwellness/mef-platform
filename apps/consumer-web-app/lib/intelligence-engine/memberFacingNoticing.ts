/**
 * Member Experience — "What We're Noticing" (Prompt 6). Members never see
 * diagnostic language, internal questionnaire names, or severity/priority
 * jargon — this reshapes the same active, member-visible registry
 * findings the coach's Root Cause Signals panel uses into plain,
 * wellness-coaching-scope sections. Every source finding was already
 * gated member_visible=true and status='active' by RLS/the adapter that
 * wrote it (migration 40's own member_read_own_registry_entries policy
 * already filters this — this module doesn't re-check visibility, it
 * trusts what it's given, same as every other member-facing reshape in
 * this codebase).
 *
 * There is no `nextSteps` field here on purpose. An earlier version
 * mapped `FindingBasedSuggestion.reason` (findingRecommendations.ts) into
 * a "Suggested Next Steps" list — but `reason` is only ever the WHY
 * ("Based on stress and lifestyle balance noticed recently."), never a
 * real action; no step/title/link was ever computed anywhere in that
 * pipeline. The member-visible action is `recommendedInvestigation`
 * (app/actions/memberNoticing.ts, sourced from the Root Router), which
 * already carries a real display name and route.
 */

import type { RegistryDomain, RegistryEntry } from '@mef/shared-types-contracts';

const EDUCATIONAL_NOTE_BY_DOMAIN: Partial<Record<RegistryDomain, string>> = {
  sleep:
    'Sleep quality and energy are closely linked. Small, consistent changes to a wind-down routine tend to help both.',
  stress:
    'Stress often shows up in the body before it shows up in mood. Tracking it alongside sleep and digestion can reveal patterns.',
  nutrition:
    'Digestion and nutrition often improve together when meal timing and food quality are addressed as one habit, not two.',
  movement:
    'Movement patterns noticed early are usually easiest to address with small, targeted adjustments.',
  posture: 'Posture-related patterns often respond well to short, consistent daily mobility work.',
  breathing:
    'Breathing mechanics and posture are closely connected. Improving one often helps the other.',
};

export type MemberNoticingView = {
  noticing: string[];
  improving: string[];
  worthAttention: string[];
  educationalNotes: string[];
};

const ATTENTION_SEVERITIES = new Set(['moderate', 'significant']);

export function buildMemberFacingNoticing(memberVisibleFindings: RegistryEntry[]): MemberNoticingView {
  const active = memberVisibleFindings.filter(
    (f) => f.status === 'active' && f.member_visible && f.severity && f.severity !== 'none'
  );

  const noticing = active.map((f) => f.narrative ?? f.label);

  const improving = memberVisibleFindings
    .filter((f) => f.member_visible && (f.trend_status === 'improving' || f.severity === 'none'))
    .map((f) => `${f.label} has been improving.`);

  const worthAttention = active
    .filter((f) => f.severity && ATTENTION_SEVERITIES.has(f.severity))
    .map((f) => f.label);

  const touchedDomains = new Set(active.map((f) => f.domain));
  const educationalNotes = [...touchedDomains]
    .map((domain) => EDUCATIONAL_NOTE_BY_DOMAIN[domain])
    .filter((note): note is string => Boolean(note));

  return { noticing, improving, worthAttention, educationalNotes };
}
