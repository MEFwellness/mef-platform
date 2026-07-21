/**
 * Member Experience — "What We're Noticing" (Prompt 6). Members never see
 * diagnostic language, internal questionnaire names, or severity/priority
 * jargon — this reshapes the same active, member-visible registry
 * findings and finding-based suggestions the coach's Root Cause Signals
 * panel uses into four plain, wellness-coaching-scope sections. Every
 * source finding was already gated member_visible=true and status='active'
 * by RLS/the adapter that wrote it (migration 40's own
 * member_read_own_registry_entries policy already filters this — this
 * module doesn't re-check visibility, it trusts what it's given, same as
 * every other member-facing reshape in this codebase).
 */

import type { RegistryDomain, RegistryEntry } from '@mef/shared-types-contracts';
import type { FindingBasedSuggestion } from '../assessment-registry/findingRecommendations';

const EDUCATIONAL_NOTE_BY_DOMAIN: Partial<Record<RegistryDomain, string>> = {
  sleep:
    'Sleep quality and energy are closely linked — small, consistent changes to a wind-down routine tend to help both.',
  stress:
    'Stress often shows up in the body before it shows up in mood — tracking it alongside sleep and digestion can reveal patterns.',
  nutrition:
    'Digestion and nutrition often improve together when meal timing and food quality are addressed as one habit, not two.',
  movement:
    'Movement patterns noticed early are usually easiest to address with small, targeted adjustments.',
  posture: 'Posture-related patterns often respond well to short, consistent daily mobility work.',
  breathing:
    'Breathing mechanics and posture are closely connected — improving one often helps the other.',
};

export type MemberNoticingView = {
  noticing: string[];
  improving: string[];
  worthAttention: string[];
  nextSteps: string[];
  educationalNotes: string[];
};

const ATTENTION_SEVERITIES = new Set(['moderate', 'significant']);

export function buildMemberFacingNoticing(
  memberVisibleFindings: RegistryEntry[],
  suggestions: FindingBasedSuggestion[]
): MemberNoticingView {
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

  const nextSteps = suggestions.map((s) => s.reason);

  const touchedDomains = new Set(active.map((f) => f.domain));
  const educationalNotes = [...touchedDomains]
    .map((domain) => EDUCATIONAL_NOTE_BY_DOMAIN[domain])
    .filter((note): note is string => Boolean(note));

  return { noticing, improving, worthAttention, nextSteps, educationalNotes };
}
