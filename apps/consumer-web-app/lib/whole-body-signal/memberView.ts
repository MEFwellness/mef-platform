/**
 * What the member sees, and the boundary that keeps it that way.
 *
 * THIS MODULE IS THE MEMBER LAYER. It imports the scoring arithmetic and
 * nothing else from this feature. It does NOT import ./patterns.ts,
 * ./coachingQuestions.ts or ./coachView.ts, and
 * tests/whole-body-signal-member-payload.test.ts walks the transitive
 * import graph of every member surface and fails if any of them becomes
 * reachable.
 *
 * THE VIEW IT RETURNS HAS NO FIELD A PRACTITIONER READING COULD SIT IN.
 * There is no zone, no chakra, no organ, no gland, no coach topic, no
 * colour and no percentage anywhere on MemberResultsView. That is the
 * fence: not a component choosing not to draw something, but an object
 * with nowhere for it to be. The guard test asserts it by walking the
 * built object key by key rather than by reading the rendered screen.
 *
 * LOUDNESS WITHOUT A NUMBER. The signal landscape needs bars of different
 * lengths, so each card carries `bandStep`, which is the band's own place
 * in the band order and nothing else. Four bands make four lengths. A
 * percentage would have been easier and would have been a number in her
 * payload.
 *
 * IT NEVER SAYS SOMETHING IS SHOWING UP STRONGLY WHEN IT IS NOT. The lead
 * sentence ("Your answers suggest ... patterns are showing up strongly
 * right now") is printed only for a section that actually reached the
 * elevated threshold. Below it, the band's own line stands alone, because
 * the alternative is Root telling a member something untrue about herself
 * on the quietest card on her screen.
 */

import { answerSignal, shownQuestionsInSection } from './scoring';
import type { WbsSettings } from './settings';
import type {
  BranchRule,
  MemberSection,
  ReadingQuestion,
  ScaleOption,
  SignalBand,
  WbsAnswers,
  WbsResults,
} from './types';

/** One section, as her results screen holds it. No number, no colour, no Zone. */
export type MemberSectionCard = {
  sectionKey: string;
  sectionName: string;
  /** The section in plain words, for the one lead sentence a loud card prints. */
  areaPhrase: string;
  bandKey: string;
  bandLabel: string;
  /** The band's own calm sentence. */
  bandLine: string;
  /** Strong, Moderate or Mild. What the landscape labels this bar with. */
  intensityWord: string;
  /** The band's place in the band order, which is how long its bar is drawn. Never a percentage. */
  bandStep: number;
  /** How many bands exist, so a bar can be drawn as a share of the tallest. */
  bandCount: number;
  /** True only when this section reached the elevated threshold. */
  isElevated: boolean;
  /** Up to the stored maximum, in plain language, strongest first. */
  themes: string[];
};

/** One band group on her results screen, loudest first. */
export type MemberBandGroup = {
  bandKey: string;
  bandLabel: string;
  bandLine: string;
  sectionKeys: string[];
};

export type MemberResultsView = {
  /** Loudest first, which is the order both the groups and the landscape read in. */
  cards: MemberSectionCard[];
  groups: MemberBandGroup[];
  /** The loudest section's name, or null when nothing is showing up at all. */
  topSectionName: string | null;
};

/**
 * The plain language themes for one section.
 *
 * ONLY QUESTIONS THAT ACTUALLY CONTRIBUTED. A question she answered at the
 * quiet end of the scale contributed nothing worth naming, and listing it
 * as something that "showed up most" would be false. The floor is the same
 * stored moderate threshold the coach's own contributor list uses, so the
 * two sides of one sitting are reading the same answers.
 *
 * Ties break on the question's own fixed position, so the same answers
 * always produce the same three themes in the same order.
 */
export function sectionThemes(input: {
  questions: readonly ReadingQuestion[];
  scale: readonly ScaleOption[];
  branchRules: readonly BranchRule[];
  answers: WbsAnswers;
  routingOptionKey: string | null;
  sectionKey: string;
  moderateSignal: number;
  maxThemes: number;
}): string[] {
  const asked = shownQuestionsInSection(
    input.questions,
    input.sectionKey,
    input.routingOptionKey,
    input.branchRules
  );

  const scored: { theme: string; signal: number; position: number }[] = [];
  for (const question of asked) {
    const signal = answerSignal(question, input.scale, input.answers);
    if (signal === null || signal < input.moderateSignal) continue;
    scored.push({ theme: question.memberTheme, signal, position: question.position });
  }

  scored.sort((a, b) => {
    if (b.signal !== a.signal) return b.signal - a.signal;
    return a.position - b.position;
  });

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of scored) {
    const key = entry.theme.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.theme);
    if (out.length >= Math.max(0, input.maxThemes)) break;
  }
  return out;
}

export function buildMemberResultsView(input: {
  sections: readonly MemberSection[];
  questions: readonly ReadingQuestion[];
  scale: readonly ScaleOption[];
  bands: readonly SignalBand[];
  branchRules: readonly BranchRule[];
  answers: WbsAnswers;
  results: WbsResults;
  settings: WbsSettings;
}): MemberResultsView {
  const sectionByKey = new Map(input.sections.map((section) => [section.sectionKey, section]));
  const bandByKey = new Map(input.bands.map((band) => [band.bandKey, band]));
  const bandCount = input.bands.length;

  const cards: MemberSectionCard[] = [];
  for (const result of input.results.sections) {
    const section = sectionByKey.get(result.sectionKey);
    const band = bandByKey.get(result.bandKey);
    if (!section || !band) continue;
    cards.push({
      sectionKey: result.sectionKey,
      sectionName: section.displayName,
      areaPhrase: section.memberAreaPhrase,
      bandKey: band.bandKey,
      bandLabel: band.memberLabel,
      bandLine: band.memberLine,
      intensityWord: band.memberIntensityWord,
      bandStep: band.position,
      bandCount,
      isElevated: result.percent >= input.settings.elevatedMinPercent,
      themes: sectionThemes({
        questions: input.questions,
        scale: input.scale,
        branchRules: input.branchRules,
        answers: input.answers,
        routingOptionKey: input.results.routingOptionKey,
        sectionKey: result.sectionKey,
        moderateSignal: input.settings.moderateSignal,
        maxThemes: input.settings.maxMemberThemes,
      }),
    });
  }

  // Loudest band first, and only bands that actually hold a section of
  // hers, because a heading with nothing under it is a fourth thing to
  // read rather than a grouping.
  const groups: MemberBandGroup[] = input.bands
    .slice()
    .sort((a, b) => b.position - a.position)
    .map((band) => ({
      bandKey: band.bandKey,
      bandLabel: band.memberLabel,
      bandLine: band.memberLine,
      sectionKeys: cards
        .filter((card) => card.bandKey === band.bandKey)
        .map((card) => card.sectionKey),
    }))
    .filter((group) => group.sectionKeys.length > 0);

  /*
    NULL WHEN NOTHING IS SHOWING UP, and that is deliberate. The priority
    card names the loudest section. When every section is at nought there
    is no loudest one, only nine ties, and naming one anyway would be Root
    claiming something untrue about her.
  */
  const loudest = input.results.sections[0];
  const topSectionName =
    loudest && loudest.percent > 0
      ? (sectionByKey.get(loudest.sectionKey)?.displayName ?? null)
      : null;

  return { cards, groups, topSectionName };
}
