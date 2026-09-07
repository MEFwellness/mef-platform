/**
 * The shared Happiness deep-dive motion treatment, in one place.
 *
 * Five templates import from here and none of them owns any of it: the
 * question arrival, the chapter beat between screens, the ambient layer and
 * the staged closing are properties of the experience type. The numbers
 * behind them are in lib/happiness-deep-dive/motion.ts.
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
