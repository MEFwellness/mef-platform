/**
 * The coach's member view — the vocabulary.
 *
 * Six answers, in the order a coach actually needs them, and nothing else
 * on the first screen. Everything the old page showed still exists and is
 * one tap away on the detail view; nothing was deleted.
 *
 * Every field here is READ from the Member Interpretation Layer, the
 * Visibility Layer, the Priority Card engine, or the safety system. Nothing
 * in this module computes a verdict of its own, which is the whole point:
 * the coach and the member must be looking at the same conclusions, not at
 * two systems that happen to agree most days.
 */

import type { AlertTier } from '../intelligence-engine/alertTiers';
import type { CanonicalFinding, EvidenceTier } from '../member-interpretation/types';
import type { FrictionReason } from '../coaching-direction/friction';

/** One finding, as a coach reads it. Straight off the interpretation layer. */
export type DashboardFinding = {
  sourceKey: string;
  /** The plain name, from lib/naming/findingNames.ts. */
  label: string;
  /** The one sentence the member reads about it, so the two of them can discuss the same words. */
  statement: string;
  tier: EvidenceTier;
  /** "Early indication" / "Emerging pattern" / "Supported by repeated check-ins" / "Coach verified". Never a number. */
  tierLabel: string;
  domainLabel: string | null;
  /** True when only this member's coach can see it. */
  coachOnly: boolean;
};

/** One alert, already resolved to one of the two tiers. */
export type DashboardAlert = {
  alertKey: string;
  tier: AlertTier;
  tierLabel: string;
  /** What kind of alert it is, in plain language. Never the stored enum. */
  kindLabel: string;
  title: string;
  reason: string;
};

/** What she is currently working on, and how it is going. */
export type WorkingOn = {
  /** The priority's own title, verbatim from the engine. Never re-worded here. */
  title: string;
  /** The engine's own reason line, when it has an honest one. */
  help: string | null;
  /** 'active' she has it open today, 'done' she completed it, 'saved' she set it aside. */
  status: 'active' | 'done' | 'saved';
  /** Which rule produced it, in plain language, for a coach who wants to know why this and not something else. */
  ruleLabel: string;
  /** How many days running she has not responded to this thread. 0 is the healthy case. */
  consecutiveIgnored: number;
  /** Root has reworded this thread this many times. */
  approachChanges: number;
  /** Her answer to "what got in the way", when she gave one. */
  friction: FrictionAnswer | null;
};

/** Her own answer to the friction question. */
export type FrictionAnswer = {
  reason: FrictionReason;
  /** The tappable option she chose, in the wording she saw. */
  reasonLabel: string;
  /** Her free text, verbatim and untouched. Null when she typed nothing. */
  note: string | null;
  localDate: string;
  /** True when Root asked and she has not answered. That is a valid answer and is worth a coach knowing. */
  unanswered: boolean;
};

/** One thing that may be getting in the way. */
export type InTheWayItem = {
  key: string;
  /** One sentence. Plain, and never a judgement about her. */
  statement: string;
  /** Where this came from, so a coach can check it. */
  source: 'her own answer' | 'her activity' | 'the coaching engine' | 'the safety system';
};

/** One question worth asking her next, and the real state behind it. */
export type AskNextItem = {
  key: string;
  /** The question, in words a coach could say out loud. */
  question: string;
  /** Why this question, now. Always present: a suggested question with no reason is a guess. */
  because: string;
  kind:
    | 'unresolved_friction'
    | 'one_confirmation_away'
    | 'stalled_priority'
    | 'revealed_untouched'
    | 'open_safety_case';
};

/** Findings grouped by how much is behind them. */
export type ReliabilityGroup = {
  tier: EvidenceTier;
  tierLabel: string;
  /** What the tier means, in one sentence, so the label is never the only explanation. */
  meaning: string;
  findings: DashboardFinding[];
};

export type CoachDashboard = {
  memberFirstName: string;
  localDate: string;
  /** True when an open safety review is in force. Shown first and separately, always. */
  safetyActive: boolean;
  improving: DashboardFinding[];
  /** Urgent safety alerts, kept apart from everything else rather than sorted above it. */
  urgentAlerts: DashboardAlert[];
  routineAlerts: DashboardAlert[];
  needsAttention: DashboardFinding[];
  reliability: ReliabilityGroup[];
  workingOn: WorkingOn | null;
  inTheWay: InTheWayItem[];
  askNext: AskNextItem[];
  /** How many logged days are behind everything above, counted over `loggedDaysWindow` and never all time. Stated plainly rather than implied. */
  loggedDays: number;
  /** The span `loggedDays` was counted over, so the coach's screen names it rather than letting a coach read a 21 day count as a lifetime one (Build 2, 2026-08-27). */
  loggedDaysWindow: number;
  /** The honest sentence when there is not enough logged to call anything. */
  dataFloorStatement: string | null;
};

export type ToCanonical = CanonicalFinding;
