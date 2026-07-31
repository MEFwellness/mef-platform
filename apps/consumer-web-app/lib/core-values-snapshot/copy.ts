/**
 * Core Values Snapshot — member-facing copy. Every string here is final,
 * approved copy used word for word (per the build brief); the only
 * variation is template interpolation ({top}/{att}/{runner}/{q11}/
 * {guilt_area}) filled from real CvsScoring data, never invented. Mirrors
 * lib/wbsa/copy.ts's role: hand-authored, no LLM, deterministic.
 */

import type { ValueArea } from './constants';
import { AREA_LABEL } from './constants';
import type { CvsScoring } from './types';
import type { Day7Pattern } from './experiment';

export const CVS_DISPLAY_TITLE = 'Core Values Snapshot';

export const CVS_INTRO_COPY = {
  title: "Before we talk about your health, I want to know what you're protecting.",
  body: "Most wellness apps start by asking what's wrong with you. I'd rather start with what matters to you — because in my experience, the gap between those two things is where everything interesting lives. Twelve questions. No wrong answers. Answer with your gut, not your resume.",
  button: "Let's begin",
};

export const CVS_SCREEN2_INTRO =
  "That was what matters. Now — what's actually been getting your time? For each of these, be honest about the last two weeks. Not your intentions. Your calendar.";

export const CVS_SCALE_LABELS = { 1: 'None at all', 3: 'Scraps', 5: 'Real, protected time' } as const;

export const CVS_Q12_PROMPT = "Last one. Don't think — choose. If today forced you to pick:";

function label(area: ValueArea): string {
  return AREA_LABEL[area];
}

/** Beat 3 — one of four branches, {top}/{att}/{runner}/{q11} filled from real scoring. Split takes priority over slipping (and, per the "one of four branches" framing, over clear_gap/aligned too — computed upstream in scoring.ts's branch field). */
export function buildWhatRootLearned(scoring: CvsScoring): string {
  const top = label(scoring.topValue);
  const att = scoring.attention[scoring.topValue];
  const runner = label(scoring.runnerUpValue);
  const q11 = label(scoring.q11Pick);

  switch (scoring.branch) {
    case 'clear_gap':
      return `Here's what I noticed. Four different questions, four different angles — and ${top} kept showing up. When I asked what your ten-years-older self would protect, you didn't hesitate. That's usually the answer that's telling the truth. But when I asked about your last two weeks, ${top} got a ${att} out of 5. The thing you'd protect most is the thing getting protected least. I'm not going to tell you why that is — I don't know yet. But it's worth paying attention to.`;
    case 'aligned':
      return `Here's what I noticed — and honestly, it's not what I usually see. ${top} came up again and again in your answers. And when I asked about your actual last two weeks? You're living it — ${att} out of 5. Your answers are unusually consistent. What matters to you is getting your time. That's rare. The more interesting question now is what it's costing you elsewhere — I noticed ${runner} matters to you too, and it's getting less. Worth paying attention to.`;
    case 'split':
      return `Here's what caught my attention. When you answered with your gut — the extra hour, the guilt, your ten-years-older self — one picture emerged. But when I asked what would transform your life in 90 days, you chose ${q11}, which hadn't come up once before that. Your instincts and your plans are pointing in two different directions. I'm not saying either is wrong. But that split is worth paying attention to.`;
    case 'slipping':
      return `Here's what I noticed. ${top} is clearly what matters most to you — it kept surfacing, from every angle. And it's not gone from your life; you gave it a ${att} out of 5. You're holding on. But holding on and protecting are two different things. Scraps of attention keep something alive. They don't let it grow. Worth paying attention to.`;
    default:
      return '';
  }
}

export type GapVisualCopy = { matteringLabel: string; attentionLabel: string; gapLabel: string; aligned: boolean };

export function buildGapVisualCopy(scoring: CvsScoring): GapVisualCopy {
  return {
    matteringLabel: 'How much it matters',
    attentionLabel: 'Attention it’s getting',
    gapLabel: scoring.branch === 'aligned' ? 'aligned' : 'the gap',
    aligned: scoring.branch === 'aligned',
  };
}

export function buildKeyInsightCopy(scoring: CvsScoring): { topLine: string; attentionLine: string; footer: string } {
  return {
    topLine: `Your top value: ${label(scoring.topValue)}`,
    attentionLine: `Attention it's getting: ${scoring.attention[scoring.topValue]}/5`,
    footer: 'The distance between those two lines is your starting point. Not a flaw. A finding.',
  };
}

/** S1 — fires only if the Q3 guilt area has attention >= 4 (and never on the split branch, enforced in scoring.ts's s1Fires). */
export function buildS1Observation(scoring: CvsScoring): string {
  const guiltAreaLabel = label(scoring.guiltArea);
  return `One more thing surprised me. You told me you feel guilty about not doing enough for ${guiltAreaLabel} — but your last two weeks say you're actually showing up for it. Guilt about something you're already doing usually isn't about time. I don't know what it's about yet. Filing that away.`;
}

export function buildExperimentTheoryCopy(scoring: CvsScoring): { theory: string; body: string; button: string; followUpNote: string } {
  const top = label(scoring.topValue);
  return {
    theory: `My theory: ${top} isn't missing from your life because you don't care. It's missing because it's the only thing on your calendar with no appointment.`,
    body: `The experiment: For the next 7 days, give ${top} five minutes a day. Protected. Same time each day if you can. Five minutes is deliberately small — this isn't about transformation, it's about evidence. If my theory is right, the five minutes will be easy and you'll notice you want more. If it's wrong, we'll both learn something better.`,
    button: "I'm in — start the 7 days",
    followUpNote:
      "And I'm not disappearing on you. I'll check in on day 3 to see how the theory's holding up, and at the end of the seven days I'll tell you what I think your results mean.",
  };
}

export const CVS_EXPERIMENT_INTRO = "I have a theory. Help me test it.";

export function cvsDailyPromptCopy(topLabelText: string): string {
  return `Did ${topLabelText} get its five minutes today?`;
}

export function cvsDay3FollowUpText(topLabelText: string): string {
  return `Three days in. How's ${topLabelText} doing with its five minutes? However it's actually going — easy, hard, forgotten twice — that's data, and it all helps me. No grades here.`;
}

export const CVS_DAY3_OPTIONS = [
  { value: 'going_well', label: 'Going well' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'not_started', label: "Haven't started" },
] as const;

export function cvsDay7FollowUpText(topLabelText: string, pattern: Day7Pattern): string {
  const opening = "Seven days. Here's what your results tell me...";
  const reflection =
    pattern === 'mostly_yes'
      ? `You showed up for ${topLabelText} most of the week. That's not willpower — that's what happens when something finally has a protected slot. My theory held. The real question now is whether five minutes wants to become ten.`
      : `${topLabelText} didn't get consistent five minutes this week, and that's real, useful information — not a failure. Something got in the way. I'm curious what it was. No grades here, just data we can use.`;
  const bridge =
    "Either way, I want to find out what's actually pressing on your time and your attention right now — that's next.";
  return `${opening} ${reflection} ${bridge}`;
}

export const CVS_RESOURCE_SUMMARY = {
  title: 'Why Values Come Before Habits',
  label: 'The short version, from Root:',
  body: "Habits fail when they're not attached to anything — they run on willpower, and willpower is a battery, not a generator. Attach a habit to a value you're protecting and it stops being a task and becomes proof of who you are. That's why I found your values before giving you a single routine.",
  readButtonLabel: 'Read the full piece — 90 sec',
  listenButtonLabel: '🎧 Listen instead — 2 min',
};

export const CVS_RESOURCE_FULL_PIECE = `Every January, millions of people build habits that are dead by February. Here's the part nobody tells them: the habits weren't the problem. The order was. A habit is a vehicle. A value is the destination. When you build a habit that isn't driving toward something you actually value, every repetition runs on willpower — and willpower is a battery, not a generator. It drains. The habit dies. Then you blame your discipline, which was never the issue. But when a habit is attached to a real value, something different happens. The habit stops being a task and becomes a vote — proof, five minutes at a time, that you are who you say you are. Those habits don't need willpower. They need permission. That's why I didn't start by giving you a routine. I started by finding out what you're protecting. Now that I know, everything we build together gets attached to it — which means everything we build together has a reason to survive February. Your five-minute experiment isn't really about the five minutes. It's about finding out what happens when your calendar finally agrees with your values. — Root`;

export const CVS_RESOURCE_AUDIO_SRC = '/audio/values-before-habits.mp3';

export const CVS_CLOSING_REINFORCEMENT =
  "One more thing before you go. Most people run on autopilot for years without ever naming what they're actually protecting. You just did it in about seven minutes — and you've already got an experiment running to prove it. Whatever the next seven days look like, that's a starting line most people never draw. That counts.";

export const CVS_PROGRESS_CARD = {
  heading: 'Conversation 1 of 3 — complete ✓',
  subheading: 'Your free journey with Root:',
  items: [
    { done: true, label: 'Core Values Snapshot — you know what you’re protecting' },
    { done: false, label: 'Life Signal Check — where your life is speaking the loudest (next, ~4 min)' },
    { done: false, label: 'Readiness Pulse — how ready you actually are, no judgment (after that)' },
  ],
};

export const CVS_HANDOFF = {
  body: "I know what you're protecting now. What I don't know is what's pressing on it. Next, I want to find out where your life is speaking the loudest right now — not a symptom checklist, a listening session. It takes about four minutes, and when it's done, I'll have my first real theory about you.",
  primaryButton: 'Start the Life Signal Check',
  secondaryButton: 'Later — remind me',
};
