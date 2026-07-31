/**
 * The caring, non-alarming message shown when the safety screen blocks
 * automatic protein target calculation. Exact wording matters here (per
 * the task) — this is the single place it lives so it's never duplicated
 * or drifted. Kept out of app/actions/protein.ts because a 'use server'
 * file may only export async functions.
 */
export const PROTEIN_SAFETY_BLOCK_MESSAGE =
  "Thanks for letting us know. Because of what you shared, we're not going to calculate an automatic protein target for you here — this is something best figured out together with your healthcare provider or your coach, so it's set at a number that's genuinely right and safe for your body. Reach out to your coach whenever you're ready, and they'll help you from here.";
