/**
 * The Health Appraisal body map: the areas a member can mark, on the front
 * and the back, and the four things a mark can say.
 *
 * WHAT A MARK IS. One row in haq_body_map_entries (migration 262): a body
 * location, the view it was marked on (front or back) and one category. The
 * scoring engine never reads that table, and nothing here knows about a
 * score.
 *
 * LEFT AND RIGHT ARE HERS. On the front view she is looking at herself face
 * to face, so her left side is drawn on the right of the figure. On the back
 * view she is looking at her own back, so her left is on the left. Each area
 * is drawn once, by which side of the picture it sits on, and the view turns
 * that into her own left or right. The stored location is always her side.
 *
 * ONE LIST OF LOCATIONS, VALIDATED ON THE WAY IN. A location the view does
 * not carry is refused by the server, so a hand made request cannot store an
 * area that was never on the map.
 */

export type HaqBodySide = 'front' | 'back';
export type HaqBodyIssueType = 'pain' | 'swelling' | 'discomfort' | 'skin_change';

export const HAQ_BODY_SIDES: readonly HaqBodySide[] = ['front', 'back'];

export const HAQ_BODY_ISSUE_TYPES: readonly { value: HaqBodyIssueType; label: string }[] = [
  { value: 'pain', label: 'Pain' },
  { value: 'swelling', label: 'Swelling' },
  { value: 'discomfort', label: 'Discomfort' },
  { value: 'skin_change', label: 'Skin change' },
];

/** A generous ceiling on marks for one instance, so a runaway client cannot fill the table. */
export const HAQ_BODY_MAP_MARK_LIMIT = 80;

/** One drawn shape, in the figure's own 200 by 400 coordinate space. */
export type HaqBodyShape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; radius: number };

/**
 * A drawn area before it knows which view it is on.
 *
 * `pair` is 'a' for the area on the left of the picture and 'b' for the one
 * on the right; an area down the middle has no pair.
 */
type DrawnArea = {
  base: string;
  label: string;
  pair?: 'a' | 'b';
  shape: HaqBodyShape;
};

export type HaqBodyRegion = {
  /** What is stored: body_location. Her own side, never the picture's. */
  location: string;
  label: string;
  shape: HaqBodyShape;
};

const e = (cx: number, cy: number, rx: number, ry: number): HaqBodyShape => ({ kind: 'ellipse', cx, cy, rx, ry });
const r = (x: number, y: number, width: number, height: number, radius = 8): HaqBodyShape => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
  radius,
});

/** The limbs and joints, identical on both views. */
const LIMBS: DrawnArea[] = [
  { base: 'shoulder', label: 'shoulder', pair: 'a', shape: e(64, 88, 17, 13) },
  { base: 'shoulder', label: 'shoulder', pair: 'b', shape: e(136, 88, 17, 13) },
  { base: 'upper_arm', label: 'upper arm', pair: 'a', shape: r(44, 102, 18, 52) },
  { base: 'upper_arm', label: 'upper arm', pair: 'b', shape: r(138, 102, 18, 52) },
  { base: 'elbow', label: 'elbow', pair: 'a', shape: e(52, 164, 12, 11) },
  { base: 'elbow', label: 'elbow', pair: 'b', shape: e(148, 164, 12, 11) },
  { base: 'forearm', label: 'forearm', pair: 'a', shape: r(40, 176, 18, 46) },
  { base: 'forearm', label: 'forearm', pair: 'b', shape: r(142, 176, 18, 46) },
  { base: 'hand', label: 'hand and wrist', pair: 'a', shape: e(48, 238, 13, 16) },
  { base: 'hand', label: 'hand and wrist', pair: 'b', shape: e(152, 238, 13, 16) },
  { base: 'hip', label: 'hip', pair: 'a', shape: r(64, 170, 15, 32) },
  { base: 'hip', label: 'hip', pair: 'b', shape: r(121, 170, 15, 32) },
  { base: 'thigh', label: 'thigh', pair: 'a', shape: r(78, 206, 21, 64) },
  { base: 'thigh', label: 'thigh', pair: 'b', shape: r(101, 206, 21, 64) },
  { base: 'knee', label: 'knee', pair: 'a', shape: e(88, 284, 13, 12) },
  { base: 'knee', label: 'knee', pair: 'b', shape: e(112, 284, 13, 12) },
  { base: 'lower_leg', label: 'lower leg', pair: 'a', shape: r(79, 298, 19, 62) },
  { base: 'lower_leg', label: 'lower leg', pair: 'b', shape: r(102, 298, 19, 62) },
  { base: 'foot', label: 'ankle and foot', pair: 'a', shape: e(88, 374, 14, 10) },
  { base: 'foot', label: 'ankle and foot', pair: 'b', shape: e(112, 374, 14, 10) },
];

const FRONT_TRUNK: DrawnArea[] = [
  { base: 'head', label: 'Head and face', shape: e(100, 36, 22, 26) },
  { base: 'neck_front', label: 'Throat and front of neck', shape: r(89, 62, 22, 14, 6) },
  { base: 'chest', label: 'Chest', shape: r(80, 78, 40, 48) },
  { base: 'abdomen', label: 'Abdomen', shape: r(80, 128, 40, 40) },
  { base: 'pelvis', label: 'Pelvis and groin', shape: r(81, 170, 38, 32) },
];

const BACK_TRUNK: DrawnArea[] = [
  { base: 'head_back', label: 'Back of head', shape: e(100, 36, 22, 26) },
  { base: 'neck_back', label: 'Back of neck', shape: r(89, 62, 22, 14, 6) },
  { base: 'upper_back', label: 'Upper back', shape: r(80, 78, 40, 34) },
  { base: 'mid_back', label: 'Middle back', shape: r(80, 114, 40, 26) },
  { base: 'lower_back', label: 'Lower back', shape: r(80, 142, 40, 26) },
  { base: 'buttocks', label: 'Buttocks', shape: r(81, 170, 38, 32) },
];

function ownSide(view: HaqBodySide, pair: 'a' | 'b'): 'left' | 'right' {
  // Front: the left of the picture is her right. Back: the left of the picture is her left.
  if (view === 'front') return pair === 'a' ? 'right' : 'left';
  return pair === 'a' ? 'left' : 'right';
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toRegion(view: HaqBodySide, area: DrawnArea): HaqBodyRegion {
  if (!area.pair) return { location: area.base, label: area.label, shape: area.shape };
  const side = ownSide(view, area.pair);
  // A back view limb reads as the back of that limb, so a sore calf and a
  // sore shin are two different marks.
  const suffix = view === 'back' ? '_back' : '';
  const label = view === 'back' ? `Back of ${side} ${area.label}` : capitalise(`${side} ${area.label}`);
  return { location: `${side}_${area.base}${suffix}`, label, shape: area.shape };
}

const REGIONS: Record<HaqBodySide, readonly HaqBodyRegion[]> = {
  front: [...FRONT_TRUNK, ...LIMBS].map((area) => toRegion('front', area)),
  back: [...BACK_TRUNK, ...LIMBS].map((area) => toRegion('back', area)),
};

export function haqBodyRegions(view: HaqBodySide): readonly HaqBodyRegion[] {
  return REGIONS[view];
}

export function findHaqBodyRegion(view: HaqBodySide, location: string): HaqBodyRegion | undefined {
  return REGIONS[view].find((region) => region.location === location);
}

export function isHaqBodySide(value: unknown): value is HaqBodySide {
  return value === 'front' || value === 'back';
}

export function isHaqBodyIssueType(value: unknown): value is HaqBodyIssueType {
  return HAQ_BODY_ISSUE_TYPES.some((issue) => issue.value === value);
}

export function haqBodyIssueLabel(issue: HaqBodyIssueType): string {
  return HAQ_BODY_ISSUE_TYPES.find((option) => option.value === issue)?.label ?? issue;
}

/** One mark as the member's screen holds it. */
export type HaqBodyMark = {
  id: string;
  location: string;
  side: HaqBodySide;
  issueType: HaqBodyIssueType;
};

/** The words a mark is listed under: the area, and which view it was marked on. */
export function haqBodyMarkPlace(mark: Pick<HaqBodyMark, 'location' | 'side'>): string {
  const region = findHaqBodyRegion(mark.side, mark.location);
  const view = mark.side === 'front' ? 'front' : 'back';
  return region ? `${region.label} (${view})` : `(${view})`;
}
