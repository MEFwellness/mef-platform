/** Best-effort tap feedback — a no-op wherever the Vibration API doesn't exist (iOS Safari, desktop), never a thrown error. */
export function triggerHaptic(durationMs = 8): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(durationMs);
  } catch {
    // Vibration can throw in some embedded/webview contexts — tap
    // feedback is a nicety, never worth surfacing an error for.
  }
}
