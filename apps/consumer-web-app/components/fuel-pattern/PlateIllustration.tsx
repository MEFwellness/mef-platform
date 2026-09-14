'use client';

/**
 * The three plates on Question 24, drawn rather than photographed.
 *
 * WHY A DRAWING AND NOT A PHOTO. A photograph of a meal is a photograph
 * of SOMEBODY'S meal: a cuisine, a protein, a starch, a portion size, all
 * of which answer the question for her before she has. A drawn plate
 * shows proportion and nothing else, which is exactly and only what the
 * question is asking about. Photo imagery arrives in a later build, where
 * the meal system gives it something to be a photograph OF.
 *
 * Pure inline SVG in the brand palette. No library, no network request,
 * no image file, so it costs nothing to load and it inherits the page's
 * own colours. Every plate is the same size and the same rim, so the only
 * thing that differs between the three is the thing being asked about.
 *
 * DECORATIVE, DELIBERATELY. The plate is aria-hidden and the card's own
 * label and detail line carry the meaning, so a member using a screen
 * reader hears the proportion described in words rather than hearing a
 * list of coloured wedges.
 */

const RING_OUTER = 46;
const RING_INNER = 19;
const CENTER = 50;

/** The four things a wedge can be, in the brand palette and nowhere else. */
export const PLATE_COMPONENT = {
  protein: { color: '#1B3A2D', label: 'Protein' },
  vegetables: { color: '#7E9C85', label: 'Vegetables' },
  carbohydrate: { color: '#C4A050', label: 'Carbohydrate' },
  fat: { color: '#E2D2A8', label: 'Healthy fat' },
} as const;

export type PlateComponentKey = keyof typeof PLATE_COMPONENT;

export type PlateSlice = { component: PlateComponentKey; share: number };

/** Each plate's own proportions. The shares are read as they are written: they sum to 1. */
export const PLATE_SHAPES: Record<string, PlateSlice[]> = {
  protein_forward: [
    { component: 'protein', share: 0.4 },
    { component: 'vegetables', share: 0.35 },
    { component: 'fat', share: 0.1 },
    { component: 'carbohydrate', share: 0.15 },
  ],
  balanced: [
    { component: 'protein', share: 0.3 },
    { component: 'vegetables', share: 0.3 },
    { component: 'carbohydrate', share: 0.3 },
    { component: 'fat', share: 0.1 },
  ],
  carb_forward: [
    { component: 'carbohydrate', share: 0.45 },
    { component: 'vegetables', share: 0.3 },
    { component: 'protein', share: 0.2 },
    { component: 'fat', share: 0.05 },
  ],
};

function polar(radius: number, turns: number): [number, number] {
  // Starts at the top of the plate and runs clockwise, which is how a
  // plate is read.
  const angle = turns * Math.PI * 2 - Math.PI / 2;
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

/** One wedge of the ring, as a closed path between the inner and outer radius. */
function wedgePath(startTurns: number, endTurns: number): string {
  const large = endTurns - startTurns > 0.5 ? 1 : 0;
  const [ox1, oy1] = polar(RING_OUTER, startTurns);
  const [ox2, oy2] = polar(RING_OUTER, endTurns);
  const [ix2, iy2] = polar(RING_INNER, endTurns);
  const [ix1, iy1] = polar(RING_INNER, startTurns);
  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${RING_OUTER} ${RING_OUTER} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    `A ${RING_INNER} ${RING_INNER} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export function PlateIllustration({ shape, size = 108 }: { shape: PlateSlice[]; size?: number }) {
  let cursor = 0;
  const wedges = shape.map((slice) => {
    const start = cursor;
    cursor += slice.share;
    return { ...slice, path: wedgePath(start, cursor) };
  });

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {/* The plate itself: a warm ground and one hairline rim. */}
      <circle cx={CENTER} cy={CENTER} r={49} fill="#FAF7F0" stroke="#1B3A2D" strokeOpacity={0.12} strokeWidth={1} />
      {wedges.map((wedge) => (
        <path
          key={wedge.component}
          d={wedge.path}
          fill={PLATE_COMPONENT[wedge.component].color}
          stroke="#FAF7F0"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
      {/* The well in the middle, so the plate reads as a plate. */}
      <circle cx={CENTER} cy={CENTER} r={RING_INNER - 2} fill="#FAF7F0" stroke="#1B3A2D" strokeOpacity={0.08} strokeWidth={1} />
    </svg>
  );
}

/** The wedge colours in words, under the plate. Ordered exactly as the plate draws them. */
export function PlateLegend({ shape }: { shape: PlateSlice[] }) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
      {shape.map((slice) => (
        <li key={slice.component} className="flex items-center gap-1.5 text-[11px] text-[#6B7A72]">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: PLATE_COMPONENT[slice.component].color }}
          />
          {PLATE_COMPONENT[slice.component].label}
        </li>
      ))}
    </ul>
  );
}
