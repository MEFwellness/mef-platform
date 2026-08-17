/**
 * Member Interpretation Layer — the words.
 *
 * Every member-facing sentence the layer produces is authored here, from
 * tier-scoped templates. That is the primary mechanism behind "language
 * must match tier": below "supported by repeated check-ins" there is no
 * template in this file that contains the word pattern, strength,
 * corroborated or confirmed, so the ordinary path cannot produce one.
 * ./language.ts is the backstop for text that came from elsewhere.
 *
 * Voice: Case View. Plain, short, honest about how little is behind
 * something, and never clinical. No em dashes anywhere.
 */

import { getCoachingDomainInfo, type CoachingDomain } from '../investigation-engine/domains';
import { MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM } from './config';
import { distinctCheckinDays } from './tiers';
import type { DomainState, EvidenceItem, EvidenceTier, FindingVerdict } from './types';

/**
 * Where the evidence came from, in the member's own terms. Built from what
 * is actually there, so the sentence can never name a source that did not
 * contribute.
 */
export function evidenceSourcePhrase(evidence: readonly EvidenceItem[]): string {
  const kinds = new Set(evidence.map((e) => e.kind));
  const parts: string[] = [];
  if (kinds.has('intake_answer')) parts.push('your intake answers');
  if (kinds.has('assessment_result')) parts.push('an assessment you completed');
  if (kinds.has('checkin_day')) parts.push('your check-ins');
  if (kinds.has('logged_data')) parts.push('what you have logged');
  if (kinds.has('coach_input')) parts.push('your coach');
  if (parts.length === 0) return 'what is on file so far';
  if (parts.length === 1) return parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${parts.slice(0, -1).join(', ')} and ${last}`;
}

/**
 * The one statement a member reads for one finding.
 *
 * Tier decides the shape of the sentence, verdict decides its weight. A
 * finding at 'early_indication' says out loud that it is one signal, which
 * is the Case View voice applied per finding instead of only per screen.
 */
export function findingStatement(input: {
  label: string;
  tier: EvidenceTier;
  verdict: FindingVerdict;
  evidence: readonly EvidenceItem[];
}): string {
  const { label, tier, verdict, evidence } = input;
  const source = evidenceSourcePhrase(evidence);

  if (verdict === 'resolved') {
    return `${label} is no longer being reported.`;
  }

  if (tier === 'coach_verified') {
    return verdict === 'improving'
      ? `${label} is moving in a better direction, and your coach has confirmed it.`
      : `${label}. Your coach has looked at this with you and confirmed it.`;
  }

  if (tier === 'supported_by_checkins') {
    const days = distinctCheckinDays(evidence);
    const dayPhrase = days > 0 ? ` across ${days} of your logged days` : '';
    if (verdict === 'improving') return `${label} has been improving${dayPhrase}.`;
    if (verdict === 'needs_attention') {
      return `${label} has kept showing up${dayPhrase}, and it is worth real attention now.`;
    }
    return `${label} has kept showing up${dayPhrase}.`;
  }

  if (tier === 'emerging_pattern') {
    if (verdict === 'improving') {
      return `${label} has looked better more than once, from ${source}. Not enough behind it yet to lean on.`;
    }
    return `${label} has come up more than once, from ${source}. Not enough behind it yet to lean on.`;
  }

  // early_indication
  if (verdict === 'improving') {
    return `${label} looked better the last time it was measured, from ${source}. One reading, so it is a direction rather than a conclusion.`;
  }
  if (verdict === 'needs_attention') {
    return `${label} came up in ${source}. That is one signal so far, not a conclusion, and it is worth a look.`;
  }
  return `${label} came up in ${source}. One signal so far, so it points a direction rather than settling anything.`;
}

/**
 * The one statement a member reads for one domain.
 *
 * There is no "looking steady" here and there cannot be. A domain with any
 * active finding resolves to 'acknowledged' at worst (see ./domains.ts),
 * and 'acknowledged' says what is there rather than reassuring about it.
 */
export function domainStatement(input: {
  domain: CoachingDomain;
  state: DomainState;
  findingCount: number;
  loggedDays: number | null;
  windowDays: number;
}): string {
  const { state, findingCount, loggedDays, windowDays } = input;
  const label = getCoachingDomainInfo(input.domain).label;
  const findingPhrase = findingCount === 1 ? 'one thing' : `${findingCount} things`;

  switch (state) {
    case 'paused_for_coach':
      return 'Your coach is reviewing something in this area with you right now, so specific details are paused here for the moment.';
    case 'not_covered':
      return `This is real coaching territory. There is no assessment covering ${label.toLowerCase()} yet, so nothing here comes from your own activity.`;
    case 'no_data_yet':
      return `Nothing has been logged here yet, so there is nothing to call good or otherwise. Logging it in a check-in is what starts the picture.`;
    case 'too_early':
      return `${loggedDays ?? 0} of the last ${windowDays} days have something logged here. That is early, which is expected, not a problem.`;
    case 'nothing_flagged_yet':
      return `Nothing has come up here from what you have logged so far. That is not the same as nothing being here, it just means nothing has flagged yet.`;
    case 'acknowledged':
      return `${findingPhrase.charAt(0).toUpperCase()}${findingPhrase.slice(1)} noted here so far. Nothing urgent in it, and it is not nothing either.`;
    case 'worth_watching':
      return `${findingPhrase.charAt(0).toUpperCase()}${findingPhrase.slice(1)} here worth keeping an eye on.`;
    case 'needs_attention':
      return `${findingPhrase.charAt(0).toUpperCase()}${findingPhrase.slice(1)} here asking for attention now.`;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

/**
 * The sentence every surface shows instead of a strength, an opportunity or
 * a ranking when the data floor has not been met.
 *
 * Deliberately in Case View's voice, which is the one surface the audit
 * called the best behaved in the app: it names how long it has been, names
 * how much has been logged, and says out loud that this is expected.
 */
export function dataFloorStatement(loggedDays: number): string {
  const dayWord = loggedDays === 1 ? 'day' : 'days';
  return `You have ${loggedDays} logged ${dayWord} so far. I do not usually have enough to call something a strength or a problem this early, and that is expected, not a problem. It takes about ${MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM} logged days.`;
}
