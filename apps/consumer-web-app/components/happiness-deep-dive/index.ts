/**
 * The shared Happiness deep-dive treatment, in one place.
 *
 * Seven templates import from here and none of them owns any of it: the
 * question arrival, the chapter beat between screens, the ambient layer and
 * the staged closing are properties of the experience type. The numbers
 * behind them are in lib/happiness-deep-dive/motion.ts.
 *
 * THE INTERACTIVE PIECES ARE SHARED THE SAME WAY. A card carrying her own
 * words, the shelf it goes on, the deck she places it from, the two-pole
 * line she puts a mark on, the this-or-that pair she answers from the gut,
 * the round of them and the sentence that takes another one's place are all
 * here rather than inside the template that needed them first, because
 * these templates mix written questions with interactive ones and a later
 * template will want them in a different combination. Their numbers and
 * their pure helpers are in lib/happiness-deep-dive/interactive.ts, and the
 * two standing rules they serve are written at the top of that file: an
 * interactive element always sets up writing rather than replacing it, and
 * no two consecutive templates share a signature, which is why this list
 * grows rather than being reshuffled.
 */

export { AmbientDrift } from './AmbientDrift';
export { ChapterCard } from './ChapterCard';
export { HoldRing } from './HoldRing';
export { QuestionStage, type QuestionHold } from './QuestionStage';
export { FollowUpPrompt } from './FollowUpPrompt';
export {
  ClosingCenterpiece,
  ClosingTail,
  type ClosingEntry,
} from './ClosingCenterpiece';
export {
  useHappinessSittingMotion,
  initialSeenKeys,
  type HappinessSittingMotion,
} from './useHappinessSittingMotion';
export { WordCard, type WordCardTone } from './WordCard';
export { CardShelf, type ShelfCard } from './CardShelf';
export { PlacingDeck } from './PlacingDeck';
export { PoleSlider } from './PoleSlider';
export { InstinctPair } from './InstinctPair';
export { RapidRound, type RapidItem } from './RapidRound';
export { SupersededPair } from './SupersededPair';
