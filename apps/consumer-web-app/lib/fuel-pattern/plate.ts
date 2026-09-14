/**
 * Rooted Reset Fuel Pattern Assessment — her starting plate.
 *
 * THE SAME DRAWN PLATE SYSTEM QUESTION 24 USES, extended rather than
 * re-invented: the same brand palette wedges, the same rim, the same
 * component vocabulary (components/fuel-pattern/PlateIllustration.tsx).
 * What is new is that the result plate is ONE plate rather than a choice
 * between three, it is larger, and every wedge is named in words beside
 * it instead of only in a legend.
 *
 * HEALTHY FAT IS DRAWN AS AN ADDITION, NOT AS A WEDGE, because that is
 * what it is on all four plates: "+ healthy fat". Giving it a slice would
 * have meant shrinking the three real proportions to make room, so the
 * three wedges carry the proportions and the fat is said beside them.
 *
 * EVERY PROPORTION IS A WORD, AND THE SECTION CARRIES NO NUMBER AT ALL.
 * "Half the plate", "a quarter", "a small portion". The standing rule for
 * this section is that a proportion written AS A NUMBER makes the section
 * carry the small label STARTING EXPERIMENT; the rule is satisfied here by
 * the stronger route, which is that there is no number to label. That is
 * deliberate rather than lazy: the word "experiment" is the name of the
 * thing Build 4 ships (the 7 Day Fuel Experiment), and a label carrying it
 * today would read as a reference to a feature that does not exist yet.
 * tests/fuel-pattern-result-page.test.tsx asserts that the whole member
 * page renders without a single digit, which is what keeps this true.
 *
 * Nothing here is presented as a target, a requirement or an ideal, and
 * nothing here claims anything about her biology.
 */

import type { PlateSlice } from '@/components/fuel-pattern/PlateIllustration';
import type { FuelPattern } from './types';

export type FuelPlateSegment = {
  /** Which wedge it is, in the shared plate vocabulary. */
  component: PlateSlice['component'];
  /** The proportion in words, as she reads it. */
  proportion: string;
  /** What goes there, in words. */
  label: string;
};

export type FuelPlateGuide = {
  /** The wedges, in the order they are drawn, clockwise from the top. */
  shape: PlateSlice[];
  /** The same wedges in words, beside the plate. */
  segments: FuelPlateSegment[];
  /** Healthy fat, which is added to every plate rather than allotted a share of it. */
  addition: string;
  /** One line under the plate, only where the plate needs explaining. */
  caption: string | null;
};

export const FPA_PLATE_ADDITION = 'Plus healthy fat';

const BALANCED_SHAPE: PlateSlice[] = [
  { component: 'vegetables', share: 0.5 },
  { component: 'protein', share: 0.25 },
  { component: 'carbohydrate', share: 0.25 },
];

const BALANCED_SEGMENTS: FuelPlateSegment[] = [
  { component: 'vegetables', proportion: 'Half the plate', label: 'Vegetables and plants' },
  { component: 'protein', proportion: 'A quarter', label: 'Protein' },
  { component: 'carbohydrate', proportion: 'A quarter', label: 'Whole-food carbohydrate' },
];

export const FPA_PLATE_GUIDE: Record<FuelPattern, FuelPlateGuide> = {
  protein_supportive: {
    shape: [
      { component: 'vegetables', share: 0.5 },
      { component: 'protein', share: 1 / 3 },
      { component: 'carbohydrate', share: 1 / 6 },
    ],
    segments: [
      { component: 'vegetables', proportion: 'Half the plate', label: 'Vegetables and plants' },
      { component: 'protein', proportion: 'A third', label: 'Protein' },
      {
        component: 'carbohydrate',
        proportion: 'A small portion',
        label: 'Whole-food carbohydrate',
      },
    ],
    addition: FPA_PLATE_ADDITION,
    caption: null,
  },
  balanced_fuel: {
    shape: BALANCED_SHAPE,
    segments: BALANCED_SEGMENTS,
    addition: FPA_PLATE_ADDITION,
    caption: null,
  },
  carb_supportive: {
    shape: [
      { component: 'vegetables', share: 0.5 },
      { component: 'carbohydrate', share: 0.3 },
      { component: 'protein', share: 0.2 },
    ],
    segments: [
      { component: 'vegetables', proportion: 'Half the plate', label: 'Vegetables and plants' },
      {
        component: 'carbohydrate',
        proportion: 'A quarter, with a little extra room',
        label: 'Whole-food carbohydrate',
      },
      { component: 'protein', proportion: 'The remainder', label: 'Protein' },
    ],
    addition: FPA_PLATE_ADDITION,
    caption: null,
  },
  /*
    FLEXIBLE FUEL IS THE BALANCED PLATE, and the caption is what makes
    that a reading rather than a shrug. Drawing her a fourth invented
    plate would have implied the instrument found a fourth shape, which it
    did not: it found that more than one shape works for her.
  */
  flexible_fuel: {
    shape: BALANCED_SHAPE,
    segments: BALANCED_SEGMENTS,
    addition: FPA_PLATE_ADDITION,
    caption: 'A balanced plate is your natural home base. Vary it freely.',
  },
};
