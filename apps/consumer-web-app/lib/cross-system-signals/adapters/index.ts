/**
 * Every registered source, in one list.
 *
 * ADDING A SOURCE IS ONE IMPORT AND ONE LINE HERE, plus the adapter's own
 * file, a source row and its dictionary rows in a content migration.
 * Nothing in ../registry.ts, nothing in ../service.ts, nothing in the
 * store and nothing in the coach's panel changes, because none of them
 * names a source.
 */

import { bodySystemsAdapter } from './bodySystems';
import { wholeBodySignalAdapter } from './wholeBodySignal';
import { breathingCheckInAdapter } from './breathingCheckIn';
import { bodyAssessmentAdapter } from './bodyAssessment';
import { dailyCheckInAdapter } from './dailyCheckIn';
import { buildRegistry, type SignalAdapter } from '../registry';

export const SIGNAL_ADAPTERS = [
  bodySystemsAdapter,
  wholeBodySignalAdapter,
  breathingCheckInAdapter,
  bodyAssessmentAdapter,
  dailyCheckInAdapter,
] as unknown as readonly SignalAdapter<never>[];

export const SIGNAL_ADAPTER_REGISTRY = buildRegistry(SIGNAL_ADAPTERS);
