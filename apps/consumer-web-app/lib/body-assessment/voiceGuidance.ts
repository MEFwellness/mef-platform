/**
 * Spoken-guidance copy for the photo capture flow (part 1 of the mobile
 * usability fixes) — kept separate from assessmentTypes.ts's
 * `instructions` (the brief on-screen text) because these lines are meant
 * to be *heard* one at a time before the camera starts framing checks,
 * while `instructions` is the short written fallback shown on screen
 * throughout. Every phrase here is deliberately short — a member reads
 * these with their ears while positioning their body, not their eyes.
 */

/** Spoken once, in order, when an image capture step first becomes ready — before pose validation has locked onto the member at all. */
export const CAMERA_SETUP_INTRO: string[] = [
  'Place your phone upright on a stable surface.',
  'Step back until your entire body is visible.',
  'Stand inside the outline.',
];

export const CAPTURE_STATUS_LABEL: Record<
  'loading' | 'not_ready' | 'adjust' | 'hold_still' | 'ready' | 'capturing' | 'manual',
  string
> = {
  loading: 'Loading posture guidance…',
  not_ready: 'Not ready',
  adjust: 'Adjust your position',
  hold_still: 'Hold still',
  ready: 'Ready',
  capturing: 'Capturing',
  manual: 'Manual capture',
};

export const TAKING_PHOTO_PROMPT = 'Hold still. Taking your photo.';
