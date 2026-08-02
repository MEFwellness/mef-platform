/**
 * Life Signal Check — member-facing copy. Every string here is
 * hand-authored, final copy, deterministic template interpolation only
 * (signal labels, scores, the member's own duration/timing answers),
 * never invented. Mirrors lib/core-values-snapshot/copy.ts's role and,
 * per the same accuracy discipline that module's own header comment
 * documents (a real 2026-08-01 bug there), every sentence here is scoped
 * to exactly what scoring.ts actually checked.
 */

import { BODY_TEXT_LABEL, SIGNAL_LABEL, type Signal, type Duration, type TimeOfDay } from './constants';
import type { LscScoring } from './types';
import type { Day3Response, Day7Pattern } from '../core-values-snapshot/experiment';
import { AREA_LABEL } from '../core-values-snapshot/constants';
import type { CvsBranch } from '../core-values-snapshot/types';

export const LSC_DISPLAY_TITLE = 'Life Signal Check';

/** Tightened per the app-wide intro-screen design standard (roughly half the previous length): headline first, then two short lines revealed one at a time via components/IntroReveal.tsx, same emotional hook and voice as before, less to skim past. */
export const LSC_INTRO_COPY = {
  title: 'Where is your life speaking the loudest right now?',
  lines: ["Not a symptom checklist. Just where your week's been loud, and where it's been quiet.", "Eleven questions. Answer with your gut."],
  button: "Let's begin",
};

export const LSC_Q10_NOTE = 'Options generated live from your own answers above.';

function label(signal: Signal): string {
  return SIGNAL_LABEL[signal];
}

function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function patternLine(scoring: LscScoring): string {
  switch (scoring.pattern) {
    case 'one_loud':
      return `Here's what I heard. Out of everywhere I checked in this week, ${label(scoring.loudestSignal)} was the loudest voice, and it wasn't close. I'm not going to tell you why yet. I don't know. But it's worth paying attention to.`;
    case 'chorus': {
      const others = scoring.loudSignals.filter((s) => s !== scoring.chosenSignal).map(label);
      return `Here's what I heard, and it wasn't just one voice. ${label(scoring.chosenSignal)} is where I want to start, but ${formatList(others)} were talking too, and I heard them. We can't chase everything at once. The rest aren't forgotten.`;
    }
    case 'quiet_body':
      return "Here's what surprised me. Nothing you told me this week came in loud. No single signal was shouting. That's genuinely useful information, most people have at least one thing pulling at them. I don't know yet if that's real calm or something you're used to tuning out. Worth being curious about either way.";
  }
}

/** "The member's pick in question 10 always wins as the chosen signal, even when it is not the highest score. When they differ, Root says so honestly" — verbatim per the build brief, never shown for the quiet_body pattern (nothing scored loud enough for "scored louder" to mean anything). */
function pickDivergedLine(scoring: LscScoring): string | null {
  if (scoring.pattern === 'quiet_body' || !scoring.pickDivergedFromLoudest) return null;
  return `You picked ${label(scoring.chosenSignal)} even though ${label(scoring.loudestSignal)} scored louder. You know things the numbers don't.`;
}

/**
 * Question 11 sets the tone, and all four duration answers get a genuinely
 * distinct one, not just the two poles (curiosity, patience) the build
 * brief named by example: curiosity for "just this week," measured
 * attentiveness for "a few weeks," respect for "months," and patience
 * (never alarm) for "as long as I can remember." No causation claims
 * anywhere.
 */
function durationLine(duration: Duration, chosenLabel: string): string {
  switch (duration) {
    case 'just_this_week':
      return `And this is new: you said ${chosenLabel} has only been showing up this week. New enough to just watch closely, not worry about yet.`;
    case 'a_few_weeks':
      return `You said ${chosenLabel} has been building for a few weeks now. Long enough to be a real pattern, not just a rough patch.`;
    case 'months':
      return `You said ${chosenLabel} has been going on for months. That's real staying power, and it's worth understanding, not just managing.`;
    case 'as_long_as_i_can_remember':
      return `You said ${chosenLabel} has been with you as long as you can remember. That calls for patience, not urgency, and I mean that.`;
  }
}

/** The Quiet Body branch's own version of durationLine, phrased around "this has felt this good," never "showing up" or "speaking up" — nothing scored loud, so a duration line that presumes loudness would break the accuracy rule. Pairs with Question 11's own rephrase for this branch (see LifeSignalCheckTaker.tsx). */
function durationLineQuietBody(duration: Duration): string {
  switch (duration) {
    case 'just_this_week':
      return "And this is new: you said this calm has only felt this good for about a week. Worth noticing, not just enjoying quietly.";
    case 'a_few_weeks':
      return 'You said this has felt this good for a few weeks now. Long enough to actually trust it a little.';
    case 'months':
      return "You said this has felt this good for months. That's not luck, something is actually working.";
    case 'as_long_as_i_can_remember':
      return "You said this has felt this good for as long as you can remember. That's worth naming, not just taking for granted.";
  }
}

/** Question 1's contrast insight: fires only when Q1 and Q2 named two different, specific times of day (scoring.ts's q1ContrastFires) — never invented when the member said "not much of the day" or "varies" for either. */
function q1ContrastLine(scoring: LscScoring): string | null {
  if (!scoring.q1ContrastFires || !scoring.bestTimeOfDay || !scoring.hardestTimeOfDay) return null;
  const bestPhrase = Q1_CONTRAST_BEST_PHRASE[scoring.bestTimeOfDay];
  const hardestPhrase = Q1_CONTRAST_HARDEST_PHRASE[scoring.hardestTimeOfDay];
  if (!bestPhrase || !hardestPhrase) return null;
  return `You feel most like yourself ${bestPhrase}, but by ${hardestPhrase} it's gone.`;
}

const Q1_CONTRAST_BEST_PHRASE: Partial<Record<TimeOfDay, string>> = {
  mornings: 'in the mornings',
  midday: 'in the middle of the day',
  evenings: 'in the evenings',
};

const Q1_CONTRAST_HARDEST_PHRASE: Partial<Record<TimeOfDay, string>> = {
  mornings: 'morning',
  midday: 'midday',
  evenings: 'evening',
};

/** Question 3's early guess compared to what the Screen 2 signals actually found, in both directions (scoring.ts's q3Comparison) — the generalized surprise beat, for every body-text answer except "I'm okay, actually" (which keeps its own dedicated surpriseFires mechanism below). */
function q3ComparisonLine(scoring: LscScoring): string | null {
  if (!scoring.q3Comparison || !scoring.bodyText) return null;
  if (scoring.q3Comparison === 'confirmed') {
    return 'You called this in the first question. Your body predicted itself.';
  }
  return `Earlier you said: ${BODY_TEXT_LABEL[scoring.bodyText]}. Three screens later, it's actually ${label(scoring.loudestSignal)}.`;
}

export function buildLscWhatRootLearned(scoring: LscScoring): string {
  const durationText =
    scoring.pattern === 'quiet_body' ? durationLineQuietBody(scoring.duration) : durationLine(scoring.duration, label(scoring.chosenSignal));
  const parts = [patternLine(scoring), pickDivergedLine(scoring), q3ComparisonLine(scoring), durationText];
  return parts.filter((p): p is string => Boolean(p)).join(' ');
}

/** Question 1's contrast insight, exposed separately (not folded into buildLscWhatRootLearned's single paragraph) so the results view can render it in its own callout box, matching the Echo/surprise overlay treatment. */
export function buildLscQ1ContrastLine(scoring: LscScoring): string | null {
  return q1ContrastLine(scoring);
}

/** Body-Value Echo — fires only per lib/life-signal-check/scoring.ts's echoFires condition. Curious framing, never causal, always names the actual loudest signal so it reads as this member's real result, not a template. An overlay on whichever base pattern fired, never a competing or replacing one. */
export function buildLscEchoLine(scoring: LscScoring): string {
  return `Your loudest signal is ${label(scoring.loudestSignal)}, and it happens to sit right next to what you told us matters most.`;
}

/** Surprise beat — fires only when Q3 said "I'm okay, actually" and at least one signal scored loud. Exact line per the build brief. */
export const LSC_SURPRISE_LINE =
  "Earlier your body's text said it was okay. Three answers later it told me something different. That gap between how we summarize ourselves and what's actually happening is one of the most useful things I'll ever get to work with.";

export type LoudnessVisualRow = { signal: Signal; label: string; score: number; isChosen: boolean };

export function buildLoudnessVisualRows(scoring: LscScoring): LoudnessVisualRow[] {
  return (Object.keys(scoring.scores) as Signal[])
    .sort((a, b) => scoring.scores[b] - scoring.scores[a])
    .map((signal) => ({
      signal,
      label: label(signal),
      score: scoring.scores[signal],
      isChosen: signal === scoring.chosenSignal,
    }));
}

export function buildLscKeyInsightCopy(scoring: LscScoring): { topLine: string; footer: string } {
  return {
    topLine: `Loudest signal: ${label(scoring.chosenSignal)}`,
    footer: "Your body has been talking. Now we know what it's been saying.",
  };
}

/** Question 2's answer, wired directly into the experiment's own timing, and said out loud as such (the build brief's explicit ask) rather than left as an implicit "hardest point in the day." */
function timingPhrase(hardestTimeOfDay: TimeOfDay | null): string {
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

export type LscExperimentTheory = { theory: string; body: string; button: string; followUpNote: string };

const BUTTON = "I'm in: start the 7 days";
const FOLLOW_UP_NOTE =
  "And I'm not disappearing on you. I'll check in on day 3 to see how the theory's holding up, and at the end of the seven days I'll tell you what I think your results mean.";

/** One experiment per signal, six total, per the build brief. Each is a real 5-minute daily action, timed to when the member said their day gets hardest where that's natural, framed as testing a theory, never a medical claim. */
export function buildLscExperimentTheoryCopy(scoring: LscScoring): LscExperimentTheory {
  const timing = timingPhrase(scoring.hardestTimeOfDay);

  const bySignal: Record<Signal, { theory: string; body: string }> = {
    energy: {
      theory: "My theory: your energy runs out because your day has scheduled output but never a scheduled recovery.",
      body: `The experiment: for the next 7 days, take a genuine 5-minute break ${timing}. No phone, no task, just five minutes of doing nothing productive.`,
    },
    sleep: {
      theory: 'My theory: your mornings feel the way they do because your body never gets a real wind-down signal.',
      body: 'The experiment: for the next 7 days, spend 5 minutes before bed doing something with zero screens, just to give your body a clear signal that the day is actually done.',
    },
    tension: {
      theory: "My theory: that tension has been building because it never gets a real release.",
      body: `The experiment: for the next 7 days, take 5 minutes ${timing} to physically let it go, shoulders, jaw, whatever you're holding. Not a stretch routine, just noticing and releasing.`,
    },
    digestion: {
      theory: "My theory: your digestion is reacting to pace as much as to food.",
      body: 'The experiment: for the next 7 days, take the first 5 minutes of one meal a day and eat it without doing anything else at the same time.',
    },
    body: {
      theory: "My theory: something's been asking you to move differently, and you've been working around it instead of listening to it.",
      body: 'The experiment: for the next 7 days, spend 5 minutes a day on whatever gentle movement makes that ache feel a little more manageable.',
    },
    mind: {
      theory: 'My theory: your mind can’t rest because it never gets an actual stop sign.',
      body: `The experiment: for the next 7 days, take 5 minutes ${timing} to do absolutely nothing on purpose. Not scrolling. Not relaxing productively. Nothing.`,
    },
  };

  const { theory, body } = bySignal[scoring.chosenSignal];
  return { theory, body, button: BUTTON, followUpNote: FOLLOW_UP_NOTE };
}

export const LSC_EXPERIMENT_INTRO = 'I have a theory. Help me test it.';

/**
 * The daily check-in question, one per signal, naming the actual action
 * the member agreed to rather than the signal itself ("Did you get your
 * five screen-free minutes before bed?", never "Did Sleep get its five
 * minutes today?") — matches the real protocol each signal's
 * buildLscExperimentTheoryCopy already describes. A pure function of the
 * signal, so an already-active experiment picks up the rewritten question
 * immediately, not only ones started after this change.
 */
export function lscDailyPromptCopy(signal: Signal): string {
  switch (signal) {
    case 'energy':
      return 'Did you get your protected break today?';
    case 'sleep':
      return 'Did you get your five screen-free minutes before bed?';
    case 'tension':
      return 'Did you get your physical release today?';
    case 'digestion':
      return 'Did you eat those first five undistracted minutes today?';
    case 'body':
      return 'Did you get your five minutes of gentle movement today?';
    case 'mind':
      return 'Did you get your five minutes of doing nothing on purpose today?';
  }
}

export function lscDay3FollowUpText(signalLabelText: string): string {
  return `Three days in. How's ${signalLabelText} doing with its five minutes? However it's actually going (easy, hard, forgotten twice), that's data, and it all helps me. No grades here.`;
}

export const LSC_DAY3_OPTIONS = [
  { value: 'going_well', label: 'Going well' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'not_started', label: "Haven't started" },
] as const;

export function lscDay3ReflectionText(response: Day3Response): string {
  switch (response) {
    case 'going_well':
      return "Good. That's the theory holding up. Keep going, I'll check the full seven days soon.";
    case 'mixed':
      return "That's honest, and it's useful. Most real weeks are mixed. I'll still check in on the full seven days.";
    case 'not_started':
      return "No judgment, life happens. There's still time to give this a real shot before day seven.";
  }
}

export function lscDay7FollowUpText(signalLabelText: string, pattern: Day7Pattern): string {
  const opening = "Seven days. Here's what your results tell me...";
  const reflection =
    pattern === 'mostly_yes'
      ? `You showed up for ${signalLabelText} most of the week. That's not willpower. That's what happens when something finally has a protected slot. My theory held.`
      : `${signalLabelText} didn't get consistent five minutes this week, and that's real, useful information, not a failure. Something got in the way. I'm curious what it was. No grades here, just data we can use.`;
  const bridge = "Either way, you've now named what matters and heard what's loudest. There's one more conversation left in us.";
  return `${opening} ${reflection} ${bridge}`;
}

export const LSC_RESOURCE_SUMMARY = {
  title: 'Signals, Not Verdicts',
  label: 'The short version, from Root:',
  body: "A loud signal isn't a diagnosis and it isn't a verdict on how you're doing. It's information, the same way a check-engine light is information, not a sentence. Your job isn't to panic about it or ignore it. It's to get curious about it. That's the only reason I asked.",
  readButtonLabel: 'Read the full piece (60 sec)',
  listenButtonLabel: '🎧 Listen instead (2 min)',
};

export const LSC_RESOURCE_FULL_PIECE = `Most health apps treat every signal your body sends as either an emergency or nothing at all. Tired becomes "fatigue." Tense becomes "stress." A quiet mind becomes a wellness score. Somewhere in translating your week into a number, the actual information gets lost, and so does your relationship with it. Here's a different way to hold it. A signal is not a verdict. It doesn't mean you're broken, and it doesn't mean you're failing. It means something is asking for attention, the same way hunger asks for food or a full inbox asks to be opened. Some signals are loud because something needs to change. Some are loud because life got loud for a week and it will pass on its own. I can't always tell you which is which yet, and I'd rather say that honestly than manufacture a finding to sound more certain than I am. What I can do is help you notice, without judgment, and test a small, honest theory about it. That's what the next seven days are. Not a verdict. Not a fix. A question, held loosely, with real curiosity behind it.\n\nRoot`;

export const LSC_RESOURCE_AUDIO_SRC = '/audio/signals-not-verdicts.mp3';

/**
 * The closing screen's reinforcement line branches on whether the member
 * actually started the Weekly Experiment (per Root's accuracy rule: never
 * claim something isn't true for this member). Root never says "it's
 * already an experiment running" or references the seven days when nothing
 * started — a real bug found live: the old single, unconditional line
 * always claimed an experiment was running, even for a member blocked by
 * the active-experiment cap or who simply declined to start one.
 */
export function buildLscClosingReinforcement(didStartExperiment: boolean): string {
  if (didStartExperiment) {
    return "One more thing before you go. Most people either ignore what their body is telling them or panic about it. You just sat with it for four minutes, without doing either. That's rarer than it should be, and it's already an experiment running to prove something real. Whatever the next seven days look like, that counts.";
  }
  return "One more thing before you go. Most people either ignore what their body is telling them or panic about it. You just sat with it for four minutes, without doing either. That's rarer than it should be, and that counts on its own, whether or not you start the experiment today. It'll be waiting on your dashboard whenever you're ready.";
}

export const LSC_PROGRESS_CARD = {
  heading: 'Conversation 2 of 3: complete ✓',
  subheading: 'Your free journey with Root:',
  items: [
    { done: true, label: 'Core Values Snapshot: you know what you’re protecting' },
    { done: true, label: 'Life Signal Check: you know what’s loudest right now' },
    { done: false, label: 'Readiness Pulse: how ready you actually are, no judgment (next)' },
  ],
};

export const LSC_HANDOFF = {
  body: "You've named what matters. You've heard what's loudest. One question left: are you ready to do something about it? That's our last conversation.",
  readyPrompt: 'Ready for the final conversation?',
  readySupport: "We'll find out whether you're actually ready for change, not just curious about it.",
  primaryButton: 'Start the Readiness Pulse',
  // Honest, not a promise: nothing here actually reminds the member later
  // (no reminder system exists yet for an experience that isn't built),
  // so the copy never claims one. It does exactly what it says: takes the
  // member back to their dashboard.
  secondaryButton: 'Not now, back to dashboard',
};

/** Short, honest label for a Core Values Snapshot branch, for the closing screen's Body-Value Echo diagram (components/life-signal-check/LscCloseScreen.tsx) — never shown for 'aligned' since echoContext is only ever set when the branch already isn't. */
export const ECHO_BRANCH_LABEL: Record<Exclude<CvsBranch, 'aligned'>, string> = {
  clear_gap: 'a clear gap',
  slipping: 'slipping',
  split: 'a split focus',
};

export type LscEchoDiagram = { topValueLabel: string; pressureLabel: string; loudestSignalLabel: string };

/** The Body-Value Echo connection as three plain labels, for the closing screen's vertical diagram — replaces buildLscEchoLine's prose on that one screen (buildLscEchoLine itself is unchanged, still used for the stored narrative-item summary and the "What Root Learned" screen's own callout). */
export function buildLscEchoDiagram(scoring: LscScoring): LscEchoDiagram | null {
  if (!scoring.echoContext) return null;
  const branch = scoring.echoContext.branch;
  if (branch === 'aligned') return null;
  return {
    topValueLabel: AREA_LABEL[scoring.echoContext.topValue],
    pressureLabel: ECHO_BRANCH_LABEL[branch],
    loudestSignalLabel: label(scoring.loudestSignal),
  };
}

/**
 * Root "noticing something true" — one line, honestly scoped to exactly
 * what this session found, for the closing screen's Root Observation card
 * (item 14 of the closing-screen redesign). Deliberately shorter and more
 * "thinking out loud" than patternLine's own fuller explanation — this is
 * the aside, not the finding itself.
 */
export function buildLscRootObservation(scoring: LscScoring): string {
  if (scoring.pattern === 'quiet_body') {
    return "It's rare that nothing comes in loud. I'm curious what you're already doing right.";
  }
  if (scoring.pattern === 'chorus') {
    return `A few things were talking at once, and you still picked ${label(scoring.chosenSignal)} to start with. That's more decisive than most people manage.`;
  }
  if (scoring.pickDivergedFromLoudest) {
    return `You picked ${label(scoring.chosenSignal)} over the signal that scored louder. I noticed that.`;
  }
  return `I keep coming back to how loud ${label(scoring.loudestSignal)} was, compared to everything else this week.`;
}
