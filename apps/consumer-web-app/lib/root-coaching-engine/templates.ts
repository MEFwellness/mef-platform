/**
 * Conversation Template Library (Prompt 13) — the only place this module's
 * member-facing sentences are written. Every template is fixed, approved
 * copy filled in with an already-computed topic label; nothing here is
 * freeform or LLM-generated, and none of it ever names an internal system
 * (router, confidence, domain, engine, AI, algorithm). Never diagnoses,
 * never creates fear, never overwhelms.
 *
 * Rotation, not randomness: `pick()` is deterministic per (topic, rotation
 * index) so the same context asked twice in a row reads the same way, but
 * the composer can advance the index to avoid showing literally identical
 * text on a later visit — mirrors lib/longitudinal-intelligence/copy.ts's
 * own seeded-pick discipline exactly.
 */

import type { ConsistencyLevel, ConversationType } from './types';

export type TemplateContext = {
  topicLabel: string;
  historyDepthDays: number;
  consistencyLevel: ConsistencyLevel;
  hasUnfinishedExperimentPattern: boolean;
  /** Advances (topicKey + prior-shown-count) so repeat visits rotate phrasing instead of repeating verbatim. */
  rotationSeed: string;
};

export type TemplateParts = {
  observation: string;
  explanation: string;
  action: string;
  encouragement: string;
};

function pick<T>(options: readonly T[], seedKey: string): T {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) hash = (hash * 31 + seedKey.charCodeAt(i)) >>> 0;
  return options[hash % options.length]!;
}

function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const ENCOURAGEMENT_HIGH = [
  "You're staying consistent with this, and that follow-through is exactly what helps patterns come into focus.",
  "You've kept showing up for this, which makes everything I'm learning about you more reliable.",
] as const;

const ENCOURAGEMENT_LOW = [
  'No pressure here. Showing up when you can is enough.',
  "There's no need to rush this. Whenever you're ready is fine.",
] as const;

const ENCOURAGEMENT_NEUTRAL = [
  "You're gathering useful information.",
  'Every bit of this helps build a clearer picture over time.',
] as const;

function encouragementFor(ctx: TemplateContext): string {
  const pool: Record<ConsistencyLevel, readonly string[]> = {
    high: ENCOURAGEMENT_HIGH,
    low: ENCOURAGEMENT_LOW,
    mixed: ENCOURAGEMENT_NEUTRAL,
  };
  return pick(pool[ctx.consistencyLevel], `encouragement::${ctx.rotationSeed}`);
}

type Builder = (ctx: TemplateContext) => Omit<TemplateParts, 'encouragement'>;

const BUILDERS: Record<ConversationType, Builder> = {
  first_observation: (ctx) => ({
    observation: pick(
      [
        `I'm beginning to notice a small pattern with ${ctx.topicLabel}.`,
        `Something new is showing up around ${ctx.topicLabel}.`,
      ],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      [
        "One appearance isn't much to go on yet, but it's worth keeping an eye on.",
        "It's early, so this is just something to watch rather than act on yet.",
      ],
      `exp::${ctx.rotationSeed}`
    ),
    action: pick(
      [`Let's keep paying attention to ${ctx.topicLabel} this week.`, `I'll just keep noticing ${ctx.topicLabel} for now.`],
      `act::${ctx.rotationSeed}`
    ),
  }),

  repeated_signal: (ctx) => ({
    observation: pick(
      [
        `This has shown up several times recently with ${ctx.topicLabel}.`,
        `${capitalize(ctx.topicLabel)} has come up more than once lately.`,
      ],
      `obs::${ctx.rotationSeed}`
    ),
    explanation:
      ctx.historyDepthDays >= 21
        ? `Since I first noticed this a few weeks back, it's kept reappearing.`
        : pick(
            [`A repeat like this is worth a closer look.`, `Once is a coincidence. Twice is worth watching.`],
            `exp::${ctx.rotationSeed}`
          ),
    action: pick(
      [`Let's keep tracking ${ctx.topicLabel} together.`, `I'll continue watching how ${ctx.topicLabel} unfolds.`],
      `act::${ctx.rotationSeed}`
    ),
  }),

  improving_trend: (ctx) => ({
    observation: pick(
      [
        `${capitalize(ctx.topicLabel)} appears to be moving in a positive direction.`,
        `Things look like they're heading the right way with ${ctx.topicLabel}.`,
      ],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      [
        'Compared to earlier, this has been trending better.',
        'This looks like real improvement since we first started tracking it.',
      ],
      `exp::${ctx.rotationSeed}`
    ),
    action: pick(
      [`Let's keep doing what's been working with ${ctx.topicLabel}.`, `I'll keep an eye on ${ctx.topicLabel} to see if this holds.`],
      `act::${ctx.rotationSeed}`
    ),
  }),

  worsening_trend: (ctx) => ({
    observation: pick(
      [
        `${capitalize(ctx.topicLabel)} has become a little more consistent lately.`,
        `I'm seeing ${ctx.topicLabel} show up a bit more often recently.`,
      ],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      [
        'Sometimes this happens alongside changes in daily routine or stress load.',
        "This kind of shift is common and doesn't necessarily mean anything is wrong.",
      ],
      `exp::${ctx.rotationSeed}`
    ),
    action: pick(
      [`Let's continue paying attention to ${ctx.topicLabel} this week.`, `I'll keep tracking ${ctx.topicLabel} closely for now.`],
      `act::${ctx.rotationSeed}`
    ),
  }),

  conflicting_information: (ctx) => ({
    observation: pick(
      [
        `Some of your recent answers about ${ctx.topicLabel} point in different directions.`,
        `I'm seeing mixed signals around ${ctx.topicLabel} right now.`,
      ],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      ['A little more information may help clarify what’s really going on.', "This isn't unusual: it just means I need a bit more to go on."],
      `exp::${ctx.rotationSeed}`
    ),
    action: pick(
      [`Let's keep an eye on ${ctx.topicLabel} and see what becomes clearer.`, `I'll watch ${ctx.topicLabel} a bit longer before drawing any conclusions.`],
      `act::${ctx.rotationSeed}`
    ),
  }),

  new_assessment_available: (ctx) => ({
    observation: pick(
      [`Completing ${ctx.topicLabel} may help provide additional context.`, `${capitalize(ctx.topicLabel)} could help fill in a few gaps.`],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      ['A bit more information here would help build a clearer picture.', 'This would add to what I already understand.'],
      `exp::${ctx.rotationSeed}`
    ),
    action: pick(
      [`Whenever you're ready, ${ctx.topicLabel} is available for you.`, `No rush, ${ctx.topicLabel} will be there when it's a good time.`],
      `act::${ctx.rotationSeed}`
    ),
  }),

  reassessment: (ctx) => ({
    observation: pick(
      [`It may be a good time to revisit ${ctx.topicLabel} and see what has changed.`, `${capitalize(ctx.topicLabel)} might be worth another look.`],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      ['Some time has passed, and things may look different now.', 'A fresh look can show how far things have come.'],
      `exp::${ctx.rotationSeed}`
    ),
    action: pick(
      [`Whenever it feels right, ${ctx.topicLabel} is ready for you.`, `Take your time, ${ctx.topicLabel} isn't going anywhere.`],
      `act::${ctx.rotationSeed}`
    ),
  }),

  experiment_follow_up: (ctx) => ({
    observation: pick(
      [`How did ${ctx.topicLabel} feel?`, `I'd love to hear how ${ctx.topicLabel} has been going.`],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      ['Your own experience is the best information we have here.', 'What you noticed matters more than anything else.'],
      `exp::${ctx.rotationSeed}`
    ),
    action: ctx.hasUnfinishedExperimentPattern
      ? pick(
          [
            "Let's finish this one and see what it taught us before starting anything new.",
            'Closing this one out first will make the next step clearer.',
          ],
          `act::${ctx.rotationSeed}`
        )
      : pick(
          ["Whenever you're ready, let us know how it went.", 'A quick reflection whenever you have a moment would help.'],
          `act::${ctx.rotationSeed}`
        ),
  }),

  experiment_success: (ctx) => ({
    observation: pick(
      [`It looks like ${ctx.topicLabel} has been helping.`, `${capitalize(ctx.topicLabel)} seems to be paying off.`],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      [
        'This is exactly the kind of information that helps guide what comes next.',
        'Knowing what works is just as valuable as trying something new.',
      ],
      `exp::${ctx.rotationSeed}`
    ),
    action: pick(["Let's think about how to keep this going.", 'Worth considering how to build on this.'], `act::${ctx.rotationSeed}`),
  }),

  // Core Values Snapshot's day-3/day-7 candidates always arrive with a
  // `precomposedMessage` (service.ts short-circuits before ever calling
  // buildTemplateParts for them) since that experience's copy is final,
  // not template-generated. These entries exist only so BUILDERS stays a
  // total Record<ConversationType, Builder> — defensive, not expected to
  // run in practice.
  cvs_day3_checkin: (ctx) => ({
    observation: `Checking in on ${ctx.topicLabel}.`,
    explanation: 'A few days into the experiment.',
    action: 'However it is going is useful information.',
  }),
  cvs_day7_result: (ctx) => ({
    observation: `Seven days with ${ctx.topicLabel}.`,
    explanation: "Here's what the week's pattern shows.",
    action: 'Worth a look whenever you have a moment.',
  }),

  // Life Signal Check's day-3/day-7 candidates, same defensive-only shape
  // as Core Values Snapshot's own two above — its copy is also final,
  // not template-generated.
  lsc_day3_checkin: (ctx) => ({
    observation: `Checking in on ${ctx.topicLabel}.`,
    explanation: 'A few days into the experiment.',
    action: 'However it is going is useful information.',
  }),
  lsc_day7_result: (ctx) => ({
    observation: `Seven days with ${ctx.topicLabel}.`,
    explanation: "Here's what the week's pattern shows.",
    action: 'Worth a look whenever you have a moment.',
  }),

  experiment_unsuccessful: (ctx) => ({
    observation: pick(
      [
        "This doesn't appear to be giving you the results I hoped for.",
        `${capitalize(ctx.topicLabel)} doesn't seem to be landing the way we'd hoped.`,
      ],
      `obs::${ctx.rotationSeed}`
    ),
    explanation: pick(
      ["That's still useful to know: it helps rule things out.", "Not every approach works for every person, and that's alright."],
      `exp::${ctx.rotationSeed}`
    ),
    action: pick(["Let's think about trying something different next.", 'I can look at a different angle from here.'], `act::${ctx.rotationSeed}`),
  }),
};

/** The one exported entry point — every conversation type resolves through the same shape, never a special-cased caller. */
export function buildTemplateParts(conversationType: ConversationType, ctx: TemplateContext): TemplateParts {
  const parts = BUILDERS[conversationType](ctx);
  return { ...parts, encouragement: encouragementFor(ctx) };
}
