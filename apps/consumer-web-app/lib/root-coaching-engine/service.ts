/**
 * Root Coaching Conversation Engine — the one orchestration entry point
 * (Prompt 13). Pure, no I/O: composes the Adaptive Coaching Selector, the
 * Coaching Message Composer, and the Coach Summary Generator over
 * already-fetched inputs. The caller (app/actions/rootCoaching.ts) is
 * responsible for gathering those inputs (reusing gatherRootMapInputs,
 * computeLongitudinalSignals, listMyLifestyleExperiments, etc.) and for
 * persisting the chosen message via ./data.ts — this file never touches the
 * database.
 */

import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence';
import type { RootRouterOutcomeView } from '@/lib/investigation-engine/routerOutcome';
import type { LifestyleExperiment } from '@/lib/lifestyle-experiments';
import { composeCoachingMessage } from './composer';
import { buildCoachWorkspaceSummary } from './coachSummary';
import { selectCoachingCandidates } from './selector';
import type { TemplateContext } from './templates';
import type {
  CoachingCandidate,
  CoachingMessageRow,
  CoachingMessageView,
  CoachWorkspaceSummary,
  MemberEngagementProfile,
} from './types';

export type PlanCoachingConversationInput = {
  signals: LongitudinalSignal[];
  routerOutcome: RootRouterOutcomeView;
  experiments: LifestyleExperiment[];
  engagementProfile: MemberEngagementProfile;
  recentMessages: CoachingMessageRow[];
  asOfLocalDate: string;
};

export type CoachingConversationPlan = {
  /** Null when nothing rises to a conversation today — never forced, never random. */
  chosenCandidate: CoachingCandidate | null;
  message: CoachingMessageView | null;
  workspaceSummary: CoachWorkspaceSummary;
};

export function planCoachingConversation(input: PlanCoachingConversationInput): CoachingConversationPlan {
  const candidates = selectCoachingCandidates(input);
  const chosenCandidate = candidates[0] ?? null;

  let message: CoachingMessageView | null = null;
  if (chosenCandidate) {
    // Keyed off distinct prior *days* this topic was messaged, not raw row
    // count — so re-selecting the same topic multiple times on the same day
    // (a reload, a prefetch, a coach re-opening the workspace) always
    // resolves to the same rotation index, keeping the member's message
    // stable through the day. It only advances once a new calendar day's
    // row actually lands.
    const priorDays = new Set(
      input.recentMessages.filter((m) => m.topicKey === chosenCandidate.topicKey).map((m) => m.shownAt.slice(0, 10))
    ).size;
    const ctx: TemplateContext = {
      topicLabel: chosenCandidate.topicLabel,
      historyDepthDays: chosenCandidate.historyDepthDays,
      consistencyLevel: input.engagementProfile.consistencyLevel,
      hasUnfinishedExperimentPattern: input.engagementProfile.hasUnfinishedExperimentPattern,
      rotationSeed: `${chosenCandidate.topicKey}::${priorDays}`,
    };
    const composed = composeCoachingMessage(chosenCandidate.conversationType, ctx);
    message = { ...composed, conversationType: chosenCandidate.conversationType };
  }

  const workspaceSummary = buildCoachWorkspaceSummary({ candidates, recentMessages: input.recentMessages });

  return { chosenCandidate, message, workspaceSummary };
}
