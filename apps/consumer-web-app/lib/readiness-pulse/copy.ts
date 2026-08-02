/**
 * Readiness Pulse — member-facing copy. Every string here is hand-authored,
 * final copy, deterministic template interpolation only, never invented.
 * Mirrors lib/life-signal-check/copy.ts's role and accuracy discipline:
 * every sentence is scoped to exactly what scoring.ts actually checked. No
 * em dashes anywhere, per the standing house style.
 */

import { SIGNAL_LABEL, type Signal } from '../life-signal-check/constants';
import { AREA_LABEL, type ValueArea } from '../core-values-snapshot/constants';
import type { Day3Response, Day7Pattern } from '../core-values-snapshot/experiment';
import {
  READINESS_PATTERN_LABEL,
  type Q2Answer,
  type ReadinessPattern,
} from './constants';
import type { RplScoring } from './types';

export const RPL_DISPLAY_TITLE = 'Readiness Pulse';

export const RPL_INTRO_COPY = {
  title: 'Are you actually ready, or just curious?',
  lines: [
    'No importance ratings this time. Just honest picks, one frank question about your calendar, and one direct question at the end.',
    'Nine questions. Every answer, including "not yet," is a real answer.',
  ],
  button: "Let's begin",
};

function readinessLabel(pattern: ReadinessPattern): string {
  return READINESS_PATTERN_LABEL[pattern];
}

// --- Q1/Q2 reinforcement framing (not scored, steers copy only) --------

const TRIED_Q2_LINE: Record<Exclude<Q2Answer, 'never_right_time' | 'didnt_know_where' | 'afraid_wouldnt_stick' | 'nothing_forced_me'>, string> = {
  life_got_busy:
    "You told me life got busy before. So this time we protect a slot instead of hoping one appears, five minutes, timed to when you actually have it.",
  motivation_faded:
    "You told me motivation faded before. That's fine, we're not counting on it this time. We're counting on evidence, which doesn't need you to feel like it.",
  results_too_slow:
    "You told me results came too slow before. This time we're not measuring results in seven days, we're measuring evidence. Small proof, not a transformation, is exactly the point.",
  nobody_noticed:
    "You told me nobody noticed you were trying before. I will. I'll check in on day three, and again on day seven, whether it's going well or not.",
};

const NEVER_STARTED_Q2_LINE: Record<Extract<Q2Answer, 'never_right_time' | 'didnt_know_where' | 'afraid_wouldnt_stick' | 'nothing_forced_me'>, string> = {
  never_right_time:
    "You've thought about this before, but it never felt like the right time. There's no perfect time coming. This is just a real, honest first try, and that counts on its own.",
  didnt_know_where:
    "You didn't know where to start before. You don't have to figure that out alone this time, I already have a real, specific place to start.",
  afraid_wouldnt_stick:
    "You were afraid it wouldn't stick before. Fair. We're not asking for forever, just seven honest days, and we'll look at what actually happened, not what you're afraid might happen.",
  nothing_forced_me:
    "Nothing forced you to start before, and nothing's forcing you now either. You're choosing this. That's a different, sturdier reason to begin.",
};

function q2FramingLine(scoring: RplScoring): string {
  if (scoring.triedBranch === 'never_started') {
    const key = (scoring.q2 as keyof typeof NEVER_STARTED_Q2_LINE) ?? 'nothing_forced_me';
    return NEVER_STARTED_Q2_LINE[key] ?? NEVER_STARTED_Q2_LINE.nothing_forced_me;
  }
  const key = (scoring.q2 as keyof typeof TRIED_Q2_LINE) ?? 'motivation_faded';
  return TRIED_Q2_LINE[key] ?? TRIED_Q2_LINE.motivation_faded;
}

/** The closing screen's first beat: honest reinforcement matched to her pattern and her Q2 history framing, branching on whether an experiment actually started (same accuracy discipline as Life Signal Check's own buildLscClosingReinforcement). */
export function buildRplClosingReinforcement(scoring: RplScoring, didStartExperiment: boolean): string {
  const q2Line = q2FramingLine(scoring);
  const experimentLine =
    scoring.finalPattern === 'not_yet'
      ? "I'm not disappearing either way. The Noticing is already running, zero pressure, just paying attention."
      : didStartExperiment
        ? "It's already running, whatever the next seven days look like, that counts."
        : "It'll be waiting on your dashboard whenever you're ready to start it.";
  return `${q2Line} ${experimentLine}`;
}

// --- Question 8 comparison -----------------------------------------------

export function buildRplQ8ComparisonLine(scoring: RplScoring): string | null {
  if (scoring.q8Comparison === null) return null;
  const q8Label = SIGNAL_LABEL[scoring.q8Signal];
  if (scoring.q8Comparison === 'confirmed') {
    return `You named ${q8Label} as the one thing you'd change, and that's exactly what your body already named as loudest. Confirmation, not a coincidence.`;
  }
  const loudestLabel = SIGNAL_LABEL[scoring.lscContext!.loudestSignal];
  return `Your body said ${loudestLabel} was loudest, and what you most want changed is ${q8Label}. Both are true, and ${q8Label} is where we'll start, since you're the one who chose it.`;
}

// --- Evidence Echo overlay -------------------------------------------------

export type EvidenceEchoContext = { signalLabel: string; yesCount: number; windowDays: number };

/** Fires only when scoring.ts's own eligibility check found a real, completed-or-active Life Signal Check experiment with real day answers in the last 14 days (see app/actions/readinessPulse.ts's getEvidenceEchoContext) — an overlay on whichever pattern fired, never a fifth pattern, numbers only from real logged days. */
export function buildEvidenceEchoLine(echo: EvidenceEchoContext): string {
  return `You have been giving ${echo.signalLabel} its five minutes on ${echo.yesCount} of the last ${echo.windowDays} days. Readiness is not a feeling you wait for, you have been demonstrating it.`;
}

// --- The surprise beat (Q3 vs Q9 contradiction) ---------------------------

export function buildRplSurpriseLine(scoring: RplScoring): string | null {
  if (!scoring.surpriseFires) return null;
  if (scoring.q3 === 'overdue' && scoring.q9 === 'not_yet') {
    return "Earlier you said change felt overdue, and now you're saying not yet. Both can be true at once, and I believe you either way.";
  }
  return "Earlier you said change felt scary or exhausting, and now you're saying ready now. Both can be true at once, courage and hesitation living in the same week.";
}

// --- Divergence between the derived pattern and her Q9 pick ---------------

const PATTERN_RANK: Record<ReadinessPattern, number> = { not_yet: 1, still_deciding: 2, ready_if_small: 3, ready_now: 4 };

export function buildRplDivergenceLine(scoring: RplScoring): string | null {
  if (!scoring.pickDivergedFromDerived) return null;
  const derivedLabel = readinessLabel(scoring.derivedPattern).toLowerCase();
  const pickLabel = readinessLabel(scoring.finalPattern).toLowerCase();
  const framing =
    PATTERN_RANK[scoring.finalPattern] > PATTERN_RANK[scoring.derivedPattern]
      ? "We'll start at full size, and if it gets heavy, we shrink it without ceremony."
      : "We'll honor that. There's no ceremony required to change your mind either way, just tell me when.";
  return `Your answers read like ${derivedLabel}, and you said ${pickLabel}. ${framing}`;
}

// --- What Root Learned (the scoring-reveal beat) --------------------------

function patternStatement(scoring: RplScoring): string {
  switch (scoring.finalPattern) {
    case 'ready_now':
      return "Here's what I heard. You're ready now, and your answers back that up: real willingness, and real room in your life to act on it.";
    case 'ready_if_small':
      return "Here's what I heard. You're ready, but it needs to be small. That's not a lesser kind of ready, it's an honest one.";
    case 'still_deciding':
      return "Here's what I heard. You're still deciding, and that's a real, legitimate place to be, not a stall.";
    case 'not_yet':
      return "Here's what I heard. Not yet. I believe you, and there's zero pressure here.";
  }
}

export function buildRplWhatRootLearned(scoring: RplScoring): string {
  const parts = [patternStatement(scoring), buildRplDivergenceLine(scoring), buildRplQ8ComparisonLine(scoring), buildRplSurpriseLine(scoring)];
  return parts.filter((p): p is string => Boolean(p)).join(' ');
}

// --- Closing screen: synthesis (three cards) -------------------------------

export function buildRplProtectingLabel(topValue: ValueArea | null): string {
  return topValue ? AREA_LABEL[topValue] : 'Still coming into focus';
}

export function buildRplLoudestLabel(scoring: RplScoring): string {
  if (!scoring.lscContext) return 'Still coming into focus';
  if (scoring.lscContext.pattern === 'quiet_body') return 'Nothing was genuinely loud, and that was real information too';
  return SIGNAL_LABEL[scoring.lscContext.loudestSignal];
}

export function buildRplReadinessLabel(scoring: RplScoring): string {
  return readinessLabel(scoring.finalPattern);
}

// --- Closing screen: the pattern-anchored setup line -----------------------

export function buildRplSetupLine(pattern: ReadinessPattern): string {
  switch (pattern) {
    case 'ready_now':
    case 'ready_if_small':
      return 'Most people wait until they feel ready. You just did something rarer: you told the truth about where you are.';
    case 'still_deciding':
      return 'Deciding is a stage, not a stall, and you just did it honestly.';
    case 'not_yet':
      return 'You said not yet, and I believe you. But noticing is how building starts, and you just agreed to notice.';
  }
}

/** Beat four, alone, typed slowly and held. */
export const RPL_BUILD_LINE = "You don't wait for ready. You build it.";

export const RPL_PROGRESS_CARD = {
  heading: 'Conversation 3 of 3: complete ✓',
  subheading: 'Your free journey with Root:',
  items: [
    { done: true, label: 'Core Values Snapshot: you know what you’re protecting' },
    { done: true, label: 'Life Signal Check: you know what’s loudest right now' },
    { done: true, label: 'Readiness Pulse: you know how ready you actually are' },
  ],
};

// --- Closing screen: the membership door -----------------------------------

export type MembershipDoorCopy = { heading: string; body: string; primaryButton: string | null; secondaryButton: string };

/** Honest placeholder CTA copy only — final conversion copy and pricing hooks come later. The primary button (when present) links to the real, existing /membership page (what's included, billing contact), never an invented checkout. Not Yet gets no primary button at all: The Noticing is already running, so "I'll be here" is literally true without a sales beat attached to it. */
export function buildRplMembershipDoor(pattern: ReadinessPattern): MembershipDoorCopy {
  switch (pattern) {
    case 'ready_now':
      return {
        heading: "You're ready. Here's what full support looks like.",
        body: "You've done the free arc: what you're protecting, what's loudest, how ready you are. The ongoing work, real daily coaching, adjusted as your life actually changes, lives in membership.",
        primaryButton: 'See what membership includes',
        secondaryButton: 'Not now, back to dashboard',
      };
    case 'ready_if_small':
      return {
        heading: 'Ready, sized right. Here’s what comes next.',
        body: "Small and real beats big and abandoned. When you want the ongoing version of this, sized the same honest way, membership is there.",
        primaryButton: 'See what membership includes',
        secondaryButton: 'Not now, back to dashboard',
      };
    case 'still_deciding':
      return {
        heading: 'No rush. The door stays open.',
        body: "You're still deciding, and that's a real place to be. When you're ready to look at what ongoing support actually includes, it's a tap away, not a pitch.",
        primaryButton: 'See what membership includes',
        secondaryButton: 'Not now, back to dashboard',
      };
    case 'not_yet':
      return {
        heading: 'When you are ready, I will be here.',
        body: 'The Noticing is already running on your dashboard, zero pressure, just paying attention. No sales pitch attached to that. Whenever "not yet" turns into something else, I will be exactly where you left me.',
        primaryButton: null,
        secondaryButton: 'Back to dashboard',
      };
  }
}

// --- Resource: "Readiness Is Evidence, Not a Feeling" ----------------------

export const RPL_RESOURCE_SUMMARY = {
  title: 'Readiness Is Evidence, Not a Feeling',
  label: 'The short version, from Root:',
  body: "Motivation is weather. It changes by the hour and owes you nothing. Readiness isn't a feeling you wait to arrive, it's built, one tiny proof at a time, the same way trust is built: by what actually happened, not by what you felt like doing.",
  readButtonLabel: 'Read the full piece (60 sec)',
  listenButtonLabel: '🎧 Listen instead (2 min)',
};

export const RPL_RESOURCE_FULL_PIECE = `Most people wait to feel ready before they start. They picture readiness as a mood, a click into place, a morning where everything finally lines up. It rarely comes that way, and waiting for it is one of the most honest reasons anything ever stalls. Here is a different way to hold it. Motivation is weather. Some days it is bright and some days it is not, and neither one is a verdict on you. Readiness is different. Readiness is built, the same way any trust is built: in tiny, repeatable proofs, not in a single decisive feeling. Five minutes done on a hard day is more evidence than a big plan made on a good one. That is not a consolation prize, it is the actual mechanism. So this conversation did not ask how motivated you are. It asked what your life actually has room for, what would sink it first, and whether you are ready now, ready small, still deciding, or honestly not yet, because every one of those is a real answer and not one of them is a failing grade. Whatever you are building next, you do not have to wait to feel ready first. You build the readiness by doing the small, honest thing, and then noticing that you did.\n\nRoot`;

export const RPL_RESOURCE_AUDIO_SRC = '/audio/readiness-is-evidence.mp3';

// --- Experiments: Ready Now / Ready If It's Small (action-type) -----------

export type RplExperimentTheory = { theory: string; body: string; button: string; followUpNote: string };

const READY_BUTTON = "I'm in: start the 7 days";
const READY_FOLLOW_UP_NOTE =
  "And I'm not disappearing on you. I'll check in on day 3 to see how it's holding up, and at the end of the seven days I'll tell you what I think your results mean.";

function timingPhrase(hardestTimeOfDay: string | null): string {
  switch (hardestTimeOfDay) {
    case 'mornings':
      return "in the mornings, since that's when you said it gets loudest";
    case 'midday':
      return "in the middle of the day, since that's when you said it gets loudest";
    case 'evenings':
      return "in the evenings, since that's when you said it gets loudest";
    default:
      return 'whenever it tends to hit hardest for you';
  }
}

const READY_NOW_BY_SIGNAL: Record<Signal, { theory: string; bodyTemplate: (timing: string) => string }> = {
  energy: {
    theory: 'My theory: you already know where this needs to go. The only question left was whether you were ready to protect the time for it.',
    bodyTemplate: (timing) => `The experiment: for the next 7 days, take a real 5-minute break ${timing}. No phone, no task, just five minutes of doing nothing productive.`,
  },
  sleep: {
    theory: 'My theory: readiness here means giving your body one honest signal that the day is actually done.',
    bodyTemplate: () => 'The experiment: for the next 7 days, spend 5 minutes before bed doing something with zero screens.',
  },
  tension: {
    theory: 'My theory: you are ready to give that tension a real release instead of just carrying it.',
    bodyTemplate: (timing) => `The experiment: for the next 7 days, take 5 minutes ${timing} to physically let it go, shoulders, jaw, whatever you are holding.`,
  },
  digestion: {
    theory: 'My theory: you are ready to slow down for five real minutes, on purpose, once a day.',
    bodyTemplate: () => 'The experiment: for the next 7 days, take the first 5 minutes of one meal a day and eat it without doing anything else at the same time.',
  },
  body: {
    theory: 'My theory: you are ready to listen to it instead of working around it.',
    bodyTemplate: () => 'The experiment: for the next 7 days, spend 5 minutes a day on whatever gentle movement makes it feel a little more manageable.',
  },
  mind: {
    theory: 'My theory: you are ready to give your mind one real stop sign a day.',
    bodyTemplate: (timing) => `The experiment: for the next 7 days, take 5 minutes ${timing} to do absolutely nothing on purpose.`,
  },
};

/** Ready Now's real 5-minute daily experiment, timed to Life Signal Check's own hardest-time-of-day answer when available. */
export function buildRplReadyNowExperimentCopy(scoring: RplScoring): RplExperimentTheory {
  const { theory, bodyTemplate } = READY_NOW_BY_SIGNAL[scoring.targetSignal];
  return { theory, body: bodyTemplate(timingPhrase(scoring.lscContext?.hardestTimeOfDay ?? null)), button: READY_BUTTON, followUpNote: READY_FOLLOW_UP_NOTE };
}

const READY_IF_SMALL_BY_SIGNAL: Record<Signal, { theory: string; bodyTemplate: (timing: string) => string }> = {
  energy: {
    theory: 'My theory: small and real beats big and abandoned. Two honest minutes count.',
    bodyTemplate: (timing) => `The experiment: for the next 7 days, take a real 2-minute break ${timing}. Not five, two. Small on purpose.`,
  },
  sleep: {
    theory: 'My theory: small and real beats big and abandoned. Two honest minutes count.',
    bodyTemplate: () => 'The experiment: for the next 7 days, spend 2 minutes before bed doing something with zero screens. Small on purpose.',
  },
  tension: {
    theory: 'My theory: small and real beats big and abandoned. Two honest minutes count.',
    bodyTemplate: (timing) => `The experiment: for the next 7 days, take 2 minutes ${timing} to physically let it go. Small on purpose.`,
  },
  digestion: {
    theory: 'My theory: small and real beats big and abandoned. Two honest minutes count.',
    bodyTemplate: () => 'The experiment: for the next 7 days, take the first 2 minutes of one meal a day, undistracted. Small on purpose.',
  },
  body: {
    theory: 'My theory: small and real beats big and abandoned. Two honest minutes count.',
    bodyTemplate: () => 'The experiment: for the next 7 days, spend 2 minutes a day on whatever gentle movement helps. Small on purpose.',
  },
  mind: {
    theory: 'My theory: small and real beats big and abandoned. Two honest minutes count.',
    bodyTemplate: (timing) => `The experiment: for the next 7 days, take 2 minutes ${timing} to do absolutely nothing on purpose. Small on purpose.`,
  },
};

/** Ready If It's Small's own version: same signal, deliberately smaller (2 minutes, not 5), framed as evidence, not transformation. */
export function buildRplReadyIfSmallExperimentCopy(scoring: RplScoring): RplExperimentTheory {
  const { theory, bodyTemplate } = READY_IF_SMALL_BY_SIGNAL[scoring.targetSignal];
  return { theory, body: bodyTemplate(timingPhrase(scoring.lscContext?.hardestTimeOfDay ?? null)), button: READY_BUTTON, followUpNote: READY_FOLLOW_UP_NOTE };
}

export function rplReadyDailyPromptCopy(signal: Signal, small: boolean): string {
  const minutes = small ? 'two minutes' : 'five minutes';
  switch (signal) {
    case 'energy':
      return `Did you get your ${minutes} today?`;
    case 'sleep':
      return `Did you get your ${minutes} screen-free before bed?`;
    case 'tension':
      return `Did you get your ${minutes} of release today?`;
    case 'digestion':
      return `Did you eat your ${minutes} undistracted today?`;
    case 'body':
      return `Did you get your ${minutes} of gentle movement today?`;
    case 'mind':
      return `Did you get your ${minutes} of doing nothing on purpose today?`;
  }
}

// --- Experiments: Still Deciding / Not Yet (noticing-type) ----------------

export const RPL_NOTICING_QUESTION = 'Was there a moment today you wished felt different?';

export const RPL_STILL_DECIDING_INTRO = {
  title: 'Deciding by evidence, not by pressure.',
  theory: 'My theory: you do not need to decide today. You need seven days of real data to decide with instead of seven days of guessing.',
  body: 'The experiment: for the next 7 days, one question a day, no action required. Just notice, honestly, and answer yes or no.',
  button: "I'm in: notice for 7 days",
  followUpNote: "I'll check in on day 3 and again on day 7, not to push you toward a decision, just to show you what you noticed.",
};

export const RPL_NOT_YET_INTRO = {
  title: 'The Noticing.',
  theory: 'My theory: you do not have to be ready to start paying attention.',
  body: 'The experiment: for the next 7 days, one question a day, one tap, yes or no. No behavior change asked, ever.',
  button: "I'm in: notice for 7 days",
  followUpNote: "I'll check in on day 3 and again on day 7. Zero pressure either time.",
};

export type RplExperimentIntroCopy = { eyebrow: string; heading: string; body: string; button: string; followUpNote: string };

/** The single "not started yet" theory screen for every readiness pattern — RplExperimentPanel's only entry point into per-pattern copy, so the panel itself never branches on scoring.finalPattern directly. */
export function rplExperimentIntroCopy(scoring: RplScoring): RplExperimentIntroCopy {
  switch (scoring.finalPattern) {
    case 'ready_now': {
      const { theory, body, button, followUpNote } = buildRplReadyNowExperimentCopy(scoring);
      return { eyebrow: 'I have a theory. Help me test it.', heading: theory, body, button, followUpNote };
    }
    case 'ready_if_small': {
      const { theory, body, button, followUpNote } = buildRplReadyIfSmallExperimentCopy(scoring);
      return { eyebrow: 'I have a theory. Help me test it.', heading: theory, body, button, followUpNote };
    }
    case 'still_deciding':
      return {
        eyebrow: RPL_STILL_DECIDING_INTRO.title,
        heading: RPL_STILL_DECIDING_INTRO.theory,
        body: RPL_STILL_DECIDING_INTRO.body,
        button: RPL_STILL_DECIDING_INTRO.button,
        followUpNote: RPL_STILL_DECIDING_INTRO.followUpNote,
      };
    case 'not_yet':
      return {
        eyebrow: RPL_NOT_YET_INTRO.title,
        heading: RPL_NOT_YET_INTRO.theory,
        body: RPL_NOT_YET_INTRO.body,
        button: RPL_NOT_YET_INTRO.button,
        followUpNote: RPL_NOT_YET_INTRO.followUpNote,
      };
  }
}

export function rplDay3FollowUpText(topLabelText: string): string {
  if (topLabelText === 'The Noticing') {
    return "Three days into noticing. However it's going (a lot, a little, nothing yet), that's real information. No grades here.";
  }
  if (topLabelText === 'Daily Noticing') {
    return "Three days of deciding by evidence instead of pressure. Whatever you've noticed so far, or haven't, that's useful. I'm not rushing you.";
  }
  return `Three days in. How's ${topLabelText} doing with its minutes? However it's actually going (easy, hard, forgotten twice), that's data, and it all helps me. No grades here.`;
}

export function rplDay3ReflectionText(response: Day3Response): string {
  switch (response) {
    case 'going_well':
      return "Good, that's real follow-through. I'll check the full seven days soon.";
    case 'mixed':
      return "That's honest, and it's useful. Most real weeks are mixed. I'll still check in on the full seven days.";
    case 'not_started':
      return "No judgment, life happens. There's still time to give this a real shot before day seven.";
  }
}

export function rplDay7FollowUpText(topLabelText: string, pattern: Day7Pattern): string {
  const opening = 'Seven days. Here is what I noticed...';
  const isNoticing = topLabelText === 'The Noticing' || topLabelText === 'Daily Noticing';
  const reflection = isNoticing
    ? pattern === 'mostly_yes'
      ? "You showed up to notice most of the week. That's real attention, and attention is where every real change starts."
      : "Noticing was patchy this week, and that's real, useful information too, not a failure. I'm curious what got in the way."
    : pattern === 'mostly_yes'
      ? `You showed up for ${topLabelText} most of the week. That's not willpower, that's what happens when something finally has a protected slot.`
      : `${topLabelText} didn't get consistent minutes this week, and that's real, useful information, not a failure.`;
  return `${opening} ${reflection}`;
}

/** Exact, honest-by-count copy for The Noticing's own day-7 reflection (Not Yet only) — never fabricated praise, never shame, numbers only from real answers. Still Deciding's own daily noticing experiment uses the generic Day7Pattern-based rplDay7FollowUpText above instead, since the build brief only specified exact count-tiered copy for The Noticing. */
export function rplNoticingDay7Text(yesCount: number): string {
  if (yesCount === 0) {
    return "You didn't log any moments this week. I won't pretend to know what that means. Could be a quiet week. Could be that tapping an app isn't how you keep track. Either way, nothing is lost, and I'm still here.";
  }
  if (yesCount <= 2) {
    return 'You noticed once this week. One real moment is one real data point. Nothing here needs to move faster than that.';
  }
  return `You noticed a moment on ${yesCount} of seven days. You're not unready. You're paying attention, and that's where every change I've ever seen starts.`;
}

// --- Coach view labels ------------------------------------------------------

export const RPL_WILLINGNESS_BAND_LABEL: Record<RplScoring['willingnessBand'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const RPL_CAPACITY_BAND_LABEL: Record<RplScoring['capacityBand'], string> = {
  thin: 'Thin',
  medium: 'Medium',
  strong: 'Strong',
};

export const RPL_OBSTACLE_LABEL: Record<RplScoring['q6'], string> = {
  schedule: 'Schedule',
  follow_through: 'Own follow-through',
  other_people: "Other people's needs",
  expecting_too_much: 'Expecting too much too fast',
};

export const RPL_COACHING_STYLE_LABEL: Record<RplScoring['q5'], string> = {
  direct: 'Direct, straight, no cushion',
  meaning_anchored: 'Meaning-anchored, remind me why',
  adaptive: 'Adaptive, shrink the ask',
  autonomous: 'Autonomous, give me space',
};
