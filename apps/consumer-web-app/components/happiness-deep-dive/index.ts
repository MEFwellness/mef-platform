/**
 * The shared Happiness deep-dive treatment, in one place.
 *
 * Six templates import from here and none of them owns any of it: the
 * question arrival, the chapter beat between screens, the ambient layer and
 * the staged closing are properties of the experience type. The numbers
 * behind them are in lib/happiness-deep-dive/motion.ts.
 *
 * THE INTERACTIVE PIECES ARE SHARED THE SAME WAY. A card carrying her own
 * words, the shelf it goes on, the deck she places it from and the two-pole
 * line she puts a mark on are all here rather than inside the template that
 * needed them first, because these templates mix written questions with
 * interactive ones and a later template will want them in a different
 * combination. Their numbers and their pure helpers are in
 * lib/happiness-deep-dive/interactive.ts, and the standing rule they serve
 * is written at the top of that file: an interactive element always sets up
 * writing, never replaces it.
 */

export { AmbientDrift } from './AmbientDrift';
export { ChapterCard } from './ChapterCard';
export { HoldRing } from './HoldRing';
export { QuestionStage, type QuestionHold } from './QuestionStage';
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
