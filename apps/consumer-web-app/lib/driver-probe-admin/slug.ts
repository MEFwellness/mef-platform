/**
 * question_key generation for coach-created questions — "generate
 * question_key automatically from the prompt text, show it, and allow
 * editing it only at creation time" (task requirement 3). Always
 * `checkin_probe.*`, never `checkin.*`, so a generated key can never
 * collide with FIXED_CORE_QUESTION_KEYS by construction (buildProbeBank
 * already throws defensively if one ever did — this is the first line of
 * defense, not a replacement for that check).
 */

const CHECKIN_PROBE_PREFIX = 'checkin_probe.';

/** e.g. "Did you sleep well?" -> "checkin_probe.did_you_sleep_well" */
export function slugifyPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/g, '');
  return `${CHECKIN_PROBE_PREFIX}${slug || 'question'}`;
}

/** question_key must always carry the checkin_probe. prefix — the one property that structurally guarantees no collision with a fixed-core key. */
export function isValidQuestionKey(key: string): boolean {
  return key.startsWith(CHECKIN_PROBE_PREFIX) && key.length > CHECKIN_PROBE_PREFIX.length;
}
