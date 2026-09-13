/**
 * THE FOUR THAT ONLY A COACH OPENS, and how they appear in the Wellness
 * Questionnaires library.
 *
 * WHAT THIS IS FOR. Four questionnaires have always been coach-assign-only
 * and have always been invisible until assigned: the Health & Lifestyle
 * Intake, the Rooted Reset Body Systems Survey, the Rooted Reset Whole-Body
 * Signal Assessment and the Breathing Pattern Check-In. A member who was
 * never sent one had no way of knowing it existed, and a member who had
 * finished one had no shelf to find it on again. They now stand in the
 * library like every other questionnaire: present for everybody, locked
 * until a coach hands one over.
 *
 * ASSIGNMENT IS THE ONLY KEY, AND THAT IS THE WHOLE EXCEPTION. No plan
 * opens these, at any level, which is why they carry the
 * `coach_assignment` lock reason rather than a plan one. Every other
 * questionnaire in the library is still gated exactly as it was, by
 * `membership.minLevel` through lib/assessment-registry/catalog.ts, and
 * nothing in this file touches that path.
 *
 * NO NEW GATE, NO NEW REGISTRY. Each of the four already owns the only
 * rule that decides it (lib/<feature>/access.ts: an open assignment, else
 * a finished sitting, else nothing), already resolves that rule once per
 * request (lib/<feature>/view.ts) and already re-checks it in its own route
 * and in every server action that writes. This file adds no decision of
 * its own: it reads the answer those modules already give and turns it into
 * the CatalogCard shape the library's one card component renders.
 *
 * THE NAME COMES FROM THE FEATURE'S OWN CONSTANT, never from a literal
 * here, so a rename lands on the card, the coach's list and the assignment
 * ledger in one edit.
 */

import type { CatalogFlags, CatalogSection } from '@/lib/assessment-registry/catalog';
import { describeLockReason } from '@/lib/assessment-registry/status';
import { lockNoteMessage } from '@/lib/locked-content/copy';
import {
  BODY_SYSTEMS_AREA,
  BODY_SYSTEMS_KEY,
  BODY_SYSTEMS_LABEL,
  BODY_SYSTEMS_ROUTE,
} from '@/lib/body-systems/constants';
import { WBS_AREA, WBS_KEY, WBS_LABEL, WBS_ROUTE } from '@/lib/whole-body-signal/constants';
import { HLI_AREA, HLI_KEY, HLI_LABEL, HLI_ROUTE } from '@/lib/health-intake/constants';
import { BPC_AREA, BPC_KEY, BPC_LABEL, BPC_ROUTE } from '@/lib/breathing-check-in/constants';

/** The four, addressed by their own feature keys. Not AssessmentKeys: none of them has a registry entry, deliberately. */
export type CoachAssignedQuestionnaireKey =
  | typeof HLI_KEY
  | typeof BODY_SYSTEMS_KEY
  | typeof WBS_KEY
  | typeof BPC_KEY;

export type CoachAssignedQuestionnaire = {
  key: CoachAssignedQuestionnaireKey;
  /** From the feature's own LABEL constant. One name per thing. */
  title: string;
  /** What she is looking at, in one line, in her own words. No diagnosis, no condition, no em dash. */
  description: string;
  /** The estimate the feature's own screens already give her, so the card and the intro cannot disagree. */
  estimatedMinutes: number;
  /** The area label the coach's assignable list files it under, reused so one thing is filed one way. */
  category: string;
  /** The one route. It opens the taker when a sitting is open and her results when one is finished, which is why there is no separate resume or results address. */
  route: string;
};

/**
 * THE ORDER IS THE ORDER A COACH WOULD SEND THEM IN: the intake that gives
 * the context first, then the two whole-body reads, then the one narrow
 * read. Stable, so the shelf does not reshuffle between visits.
 */
export const COACH_ASSIGNED_QUESTIONNAIRES: readonly CoachAssignedQuestionnaire[] = [
  {
    key: HLI_KEY,
    title: HLI_LABEL,
    description:
      'Your history, your habits and your day, in your own words. It is the background every other questionnaire is read against.',
    estimatedMinutes: 10,
    category: HLI_AREA,
    route: HLI_ROUTE,
  },
  {
    key: BODY_SYSTEMS_KEY,
    title: BODY_SYSTEMS_LABEL,
    description:
      'A walk through your whole body, system by system, so your coach can see which ones are speaking loudest right now.',
    estimatedMinutes: 15,
    category: BODY_SYSTEMS_AREA,
    route: BODY_SYSTEMS_ROUTE,
  },
  {
    key: WBS_KEY,
    title: WBS_LABEL,
    description:
      'The same body read a different way, across nine areas, so two sittings can be compared side by side.',
    estimatedMinutes: 15,
    category: WBS_AREA,
    route: WBS_ROUTE,
  },
  {
    key: BPC_KEY,
    title: BPC_LABEL,
    description:
      'Sixteen questions on your breathing and the sensations that travel with it. The shortest of the four.',
    estimatedMinutes: 2,
    category: BPC_AREA,
    route: BPC_ROUTE,
  },
];

/**
 * What one of the four feature services already answers with, narrowed to
 * the three facts a card needs.
 *
 * STRUCTURAL ON PURPOSE. All four states (BpcState, BodySystemsState,
 * HliState, WbsState) already have exactly this shape, so each one is
 * passed straight in with no per-feature adapter to drift. `null` is what
 * every one of them returns for a member who was never assigned it, which
 * is the locked case.
 */
export type CoachAssignedQuestionnaireState = {
  status: 'pending' | 'in_progress' | 'completed';
  session?: { completedAt: string | null } | null;
} | null;

/** The fields of a catalog card this file fills in. Structural, so it needs no import from the 'use server' module that owns CatalogCard. */
export type CoachAssignedCatalogCard = {
  key: CoachAssignedQuestionnaireKey;
  title: string;
  description: string;
  estimatedMinutes: number;
  category: string;
  section: CatalogSection;
  flags: CatalogFlags;
  draftProgress: null;
  latestCompletedAt: string | null;
  primaryHref: string | null;
  resumeHref: string | null;
  resultHref: string | null;
  coachAssignmentReason: string | null;
  assignmentId: null;
};

function lockedFlags(): CatalogFlags {
  return {
    locked: true,
    lockMessage: describeLockReason({ kind: 'coach_assignment' }),
    lockReasonKind: 'coach_assignment',
    lockRequiredLevel: null,
    lockNote: lockNoteMessage({ kind: 'coach_assignment' }),
    comingSoon: false,
    inProgress: false,
    retakeInProgress: false,
    reassessmentDueAt: null,
    scheduledAt: null,
    retakeAvailable: false,
  };
}

function openFlags(inProgress: boolean): CatalogFlags {
  return {
    locked: false,
    lockMessage: null,
    lockReasonKind: null,
    lockRequiredLevel: null,
    lockNote: null,
    comingSoon: false,
    inProgress,
    retakeInProgress: false,
    reassessmentDueAt: null,
    scheduledAt: null,
    /** A second sitting is a coach's decision, not hers, so the card never offers a retake of its own. He sends it again from his own screen. */
    retakeAvailable: false,
  };
}

/**
 * One card, from the state its own feature already resolved.
 *
 * LOCKED IS NOT HIDDEN AND NOT A DEAD END. A member with no assignment gets
 * a real, dimmed, tappable card in Premium with the gold corner marker and
 * one Root sentence naming the only thing that opens it. There is no plan
 * link on it, because no plan opens it.
 *
 * `assignmentId` IS DELIBERATELY NULL, EVEN WHEN SHE HAS ONE. That field is
 * how Home's priority card and the generic `questionnaire_assigned` Root
 * knock find a coach-assigned card to surface, and all four of these
 * already have their own Home card and their own knock, written before this
 * shelf existed. Handing the same assignment to the generic path as well
 * would show her the same thing twice on one screen and knock twice for one
 * assignment. What is offered where is unchanged by this file, which is the
 * point: only the library gained a card.
 */
export function buildCoachAssignedCatalogCard(
  questionnaire: CoachAssignedQuestionnaire,
  state: CoachAssignedQuestionnaireState
): CoachAssignedCatalogCard {
  const shared = {
    key: questionnaire.key,
    title: questionnaire.title,
    description: questionnaire.description,
    estimatedMinutes: questionnaire.estimatedMinutes,
    category: questionnaire.category,
    draftProgress: null,
    assignmentId: null,
  } as const;

  if (!state) {
    return {
      ...shared,
      section: 'premium',
      flags: lockedFlags(),
      latestCompletedAt: null,
      primaryHref: null,
      resumeHref: null,
      resultHref: null,
      coachAssignmentReason: null,
    };
  }

  if (state.status === 'completed') {
    return {
      ...shared,
      section: 'completed',
      flags: openFlags(false),
      latestCompletedAt: state.session?.completedAt ?? null,
      primaryHref: questionnaire.route,
      resumeHref: null,
      // The one route shows her finished sitting once there is one, which
      // is why View Results and Start are the same address here.
      resultHref: questionnaire.route,
      coachAssignmentReason: null,
    };
  }

  return {
    ...shared,
    section: 'assigned',
    flags: openFlags(state.status === 'in_progress'),
    latestCompletedAt: null,
    primaryHref: questionnaire.route,
    // Resume lives at the same address as Start for all four: the route
    // hands back the question she stopped on. Without this the card would
    // link to a `/take` child none of them has.
    resumeHref: questionnaire.route,
    resultHref: null,
    coachAssignmentReason: null,
  };
}
