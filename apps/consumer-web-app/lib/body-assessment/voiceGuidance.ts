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

/** Spoken once the pose has been stably valid — a distinct positive confirmation, not silence, per the guidance state machine's "ready" key. */
export const READY_PROMPT = 'Perfect. Hold still.';

/**
 * A handful of statuses need different SPOKEN phrasing than the short
 * on-screen status text — most notably multiple_people, where the
 * on-screen line ("Only one person can be in the assessment area.") is a
 * label-style statement, while the spoken line is a first-person,
 * conversational heads-up a coach would actually say out loud. Anything
 * not listed here is spoken exactly as displayed.
 */
export const SPOKEN_MESSAGE_OVERRIDES: Record<string, string> = {
  multiple_people: 'I can see another person. Please make sure only you are in the frame.',
};

/** Spoken only once a brief pose-detection gap has persisted long enough to mention (CameraCapture's tracking-loss grace window) — a genuinely momentary miss stays silent rather than alarming the member over nothing. */
export const TRACKING_BRIEFLY_LOST_PROMPT = 'I briefly lost your position. Please hold still for a moment.';
/** Spoken once a pose-detection gap has persisted long enough that "briefly" no longer applies — the original, more directive framing. */
export const TRACKING_LOST_PROMPT = "We can't see you. Step into the frame.";

export function spokenMessageFor(statusKey: string, displayMessage: string): string {
  return SPOKEN_MESSAGE_OVERRIDES[statusKey] ?? displayMessage;
}
