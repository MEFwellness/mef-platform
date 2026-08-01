/**
 * Life Signal Check — member-facing copy. Every string here is
 * hand-authored, final copy, deterministic template interpolation only
 * (signal labels, scores, the member's own duration/timing answers),
 * never invented. Mirrors lib/core-values-snapshot/copy.ts's role and,
 * per the same accuracy discipline that module's own header comment
 * documents (a real 2026-08-01 bug there), every sentence here is scoped
 * to exactly what scoring.ts actually checked.
 */

import { SIGNAL_LABEL, type Signal, type Duration, type TimeOfDay } from './constants';
import type { LscScoring } from './types';
import type { Day3Response, Day7Pattern } from '../core-values-snapshot/experiment';

export const LSC_DISPLAY_TITLE = 'Life Signal Check';

export const LSC_INTRO_COPY = {
  title: "Where is your life speaking the loudest right now?",
  body: "Not a symptom checklist. I'm not going to ask you to rate anything one to ten. I want to know where your week has actually been loud, and where it's been quiet. Eleven questions. Answer with your gut.",
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

/** Question 11 sets the tone: curiosity for "just this week," respect and patience (never alarm) for "as long as I can remember." No causation claims. */
function durationLine(duration: Duration, chosenLabel: string): string {
  switch (duration) {
    case 'just_this_week':
      return `And this is new: you said ${chosenLabel} has only been showing up this week. Worth watching closely.`;
    case 'a_few_weeks':
      return `You said ${chosenLabel} has been building for a few weeks now. Long enough that it's not just a bad day.`;
    case 'months':
      return `You said ${chosenLabel} has been going on for months. That's real staying power, and it's worth understanding, not just managing.`;
    case 'as_long_as_i_can_remember':
      return `You said ${chosenLabel} has been with you as long as you can remember. That's not a five-minute fix, and I'm not going to pretend it is. We'll go with patience, not urgency.`;
  }
}

export function buildLscWhatRootLearned(scoring: LscScoring): string {
  const parts = [patternLine(scoring), pickDivergedLine(scoring), durationLine(scoring.duration, label(scoring.chosenSignal))];
  return parts.filter((p): p is string => Boolean(p)).join(' ');
}

/** Body-Value Echo — fires only per lib/life-signal-check/scoring.ts's echoFires condition. Curious framing, never causal, exact line per the build brief. */
export const LSC_ECHO_LINE =
  'The thing you value most and the thing your body is loudest about may be pointing at the same place.';

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

function timingPhrase(hardestTimeOfDay: TimeOfDay | null): string {
  switch (hardestTimeOfDay) {
    case 'mornings':
      return 'in the mornings, right when it tends to hit hardest';
    case 'midday':
      return 'in the middle of the day, right when it tends to hit hardest';
    case 'evenings':
      return 'in the evenings, right when it tends to hit hardest';
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

export function lscDailyPromptCopy(signalLabelText: string): string {
  return `Did ${signalLabelText} get its five minutes today?`;
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

export const LSC_CLOSING_REINFORCEMENT =
  "One more thing before you go. Most people either ignore what their body is telling them or panic about it. You just sat with it for four minutes, without doing either. That's rarer than it should be, and it's already an experiment running to prove something real. Whatever the next seven days look like, that counts.";

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
  primaryButton: 'Start the Readiness Pulse',
  secondaryButton: 'Later, remind me',
};
