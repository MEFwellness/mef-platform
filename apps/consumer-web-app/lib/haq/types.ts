/**
 * Shapes for the Rooted Reset Health Appraisal Questionnaire (haq_v1).
 *
 * Nothing in this file carries a number a member could read as a score.
 * The hidden values and the section cutoffs are typed in scoringRules.ts,
 * which a member surface must never import (tests/haq-member-safety.test.ts).
 */

export type HaqResponseType = 'frequency' | 'yes_no';

export type HaqFrequencyResponse = 'never_or_rarely' | 'sometimes' | 'often' | 'very_often';
export type HaqYesNoResponse = 'no' | 'yes';
export type HaqResponse = HaqFrequencyResponse | HaqYesNoResponse;

export type HaqResponseOption = { value: HaqResponse; label: string };

/** Section ids read like the question keys they own: haq_p1_a, haq_p2. */
export type HaqSectionId = string;
/** Part ids: haq_p1 to haq_p10. */
export type HaqPartId = string;

export type HaqSection = {
  id: HaqSectionId;
  partId: HaqPartId;
  /** The printed part heading, "Part I". */
  partLabel: string;
  /** "A", "B", "C", or null for a part that is one section. */
  sectionLetter: string | null;
  title: string;
  /** Shown above the section's questions. Only Dysglycemia-L carries one. */
  intro: string | null;
  order: number;
};

export type HaqQuestion = {
  key: string;
  sectionId: HaqSectionId;
  /** Position inside its section, from 1. */
  order: number;
  prompt: string;
  responseType: HaqResponseType;
};

export type HaqResultColor = 'green' | 'yellow' | 'red';
export type HaqMemberResultLabel = 'Doing Well' | 'Needs Attention' | 'High Attention';
export type HaqOriginalPriority = 'Low Priority' | 'Moderate Priority' | 'High Priority';

/** Not Started has no row: it is the absence of an instance, exactly as the shared runtime reads it. */
export type HaqInstanceStatus = 'not_started' | 'in_progress' | 'completed';

/** What a member may read about one section of a completed instance. No total, no cutoff. */
export type HaqMemberSectionResult = {
  sectionId: HaqSectionId;
  resultColor: HaqResultColor;
  memberResultLabel: HaqMemberResultLabel;
};
