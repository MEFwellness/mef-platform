/**
 * Trend against the previous equivalent period.
 *
 * Pure arithmetic over two numbers the service layer already produced. This
 * module never queries anything and never invents a comparison: the caller
 * fetches the same metric for the current window and for the equally long
 * window immediately before it (previousPeriodOf in viewState.ts) and hands
 * both numbers here.
 *
 * TWO RULES, BOTH BORROWED FROM THE SERVICE LAYER.
 *
 * 1. A change from zero has no percentage. compareWindows in the service
 *    layer returns null rather than Infinity for exactly this case, and so
 *    does this: "she went from nothing to something" is a real observation,
 *    an infinite percentage increase is not.
 *
 * 2. Nothing in either window is not a flat trend, it is no comparison at
 *    all. Rendering "0 percent change" over two empty windows reads as a
 *    measured result when nothing was measured.
 */

export type TrendDirection = 'up' | 'down' | 'flat' | 'first' | 'none';

export type Trend = {
  current: number;
  previous: number;
  direction: TrendDirection;
  /** Whole-number percent change, or null when there is no honest percentage to give. */
  percentChange: number | null;
  /** Plain language, safe to render verbatim. Never contains an em dash. */
  description: string;
};

/**
 * @param previousLabel how to name the earlier window, e.g. "the previous 30 days".
 */
export function computeTrend(
  current: number,
  previous: number,
  previousLabel: string = 'the previous period'
): Trend {
  if (current === 0 && previous === 0) {
    return {
      current,
      previous,
      direction: 'none',
      percentChange: null,
      description: `Nothing in this period and nothing in ${previousLabel}.`,
    };
  }

  if (previous === 0) {
    return {
      current,
      previous,
      direction: 'first',
      percentChange: null,
      description: `Up from none in ${previousLabel}.`,
    };
  }

  const percentChange = Math.round(((current - previous) / previous) * 100);

  if (current === previous) {
    return {
      current,
      previous,
      direction: 'flat',
      percentChange: 0,
      description: `Unchanged from ${previous} in ${previousLabel}.`,
    };
  }

  return {
    current,
    previous,
    direction: current > previous ? 'up' : 'down',
    percentChange,
    description: `${current > previous ? 'Up' : 'Down'} from ${previous} in ${previousLabel}.`,
  };
}

/** The short form shown on a metric card, next to the arrow. Empty when there is nothing honest to say. */
export function trendChip(trend: Trend): string {
  switch (trend.direction) {
    case 'up':
    case 'down':
      return `${trend.percentChange! > 0 ? '+' : ''}${trend.percentChange}%`;
    case 'flat':
      return 'No change';
    case 'first':
      return 'First activity';
    case 'none':
      return '';
  }
}
