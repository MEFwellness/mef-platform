/**
 * How a blueprint's status looks and reads, decided once.
 *
 * Three states and no synonyms: a draft is authored and unassignable, an
 * approved version is assignable, an archived one keeps its history and
 * starts nothing new. The words on the screen are the words in the
 * database, so a person reading a pill and a person reading a row are
 * talking about the same thing.
 */
import type { BlueprintStatus } from '@mef/shared-types-contracts';

export const BLUEPRINT_STATUS_LABEL: Record<BlueprintStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  archived: 'Archived',
};

export const BLUEPRINT_STATUS_TONE: Record<BlueprintStatus, string> = {
  draft: 'bg-[#F5B700]/[0.18] text-[#854D0E]',
  approved: 'bg-[#1B3A2D]/[0.10] text-[#1B3A2D]',
  archived: 'bg-[#1B3A2D]/[0.05] text-[#9AA79F]',
};

/** What each status means for a coach trying to give this program to somebody. */
export const BLUEPRINT_STATUS_MEANING: Record<BlueprintStatus, string> = {
  draft: 'Nobody can be given this yet. It becomes assignable when an administrator approves it.',
  approved: 'Coaches can give this to a member.',
  archived: 'Retired. It starts nothing new, and every program already running from it keeps running.',
};
