/**
 * Shared shapes for the narrative layer. A narrative item is never
 * mutated in place by the update service — generator.ts produces drafts,
 * service.ts decides whether an equivalent active item already exists
 * (dedup by category+title, see service.ts) and either skips or inserts
 * a new row, superseding whatever it replaces. Only a coach mutates an
 * existing row directly (pin/protect/mark outdated/correct — see
 * app/actions/narrative.ts).
 */

import type {
  NarrativeCategory,
  NarrativeProvenance,
  NarrativeSourceRef,
} from '@mef/shared-types-contracts';

export type NarrativeItemDraft = {
  category: NarrativeCategory;
  /** Stable, deterministic per underlying pattern — used for dedup, so wording must not vary run to run (numbers inside `summary` may vary; `title` should not). */
  title: string;
  summary: string;
  provenance: NarrativeProvenance;
  confidence: number | null;
  memberVisible: boolean;
  sourceRefs: NarrativeSourceRef[];
};
