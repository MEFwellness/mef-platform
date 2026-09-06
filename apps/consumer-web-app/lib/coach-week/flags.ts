/**
 * One finding, once.
 *
 * THE PROBLEM. Two systems already tell a coach that something is worth a
 * conversation, and until now they lived on two different screens. The
 * client LIST computes `attentionReasons` (app/coach/lib.ts, plus
 * lib/program-lifecycle/coachAttention.ts and
 * lib/programs/feedback/attention.ts). The client PAGE renders persisted
 * coach ALERTS (lib/intelligence-engine/alerts.ts). Put them on one screen
 * and some of them say the same thing twice in different words: "No
 * check-in logged today" beside "No recent check-in", "Pain increasing"
 * beside "Pain has been getting worse".
 *
 * WHAT THIS FILE DOES, AND ONLY THIS. It maps both vocabularies onto one
 * canonical key and drops the client-list reason when an alert already
 * covers that key. It invents no rule, computes no threshold and reads no
 * data: every reason it is handed was produced by the same functions the
 * client list calls, and every alert was persisted by the intelligence
 * engine. Adding a rule here would be exactly the drift this build was
 * asked to close.
 *
 * ALERTS WIN, ALWAYS. An alert is a stored row with a tier, a title and a
 * reason a coach can act on. A client-list reason is a short label. When
 * both describe one fact, the alert is the one shown.
 *
 * AN UNRECOGNISED REASON IS STILL SHOWN. It gets its own key, so a reason
 * added tomorrow surfaces on the page rather than being silently swallowed
 * by a mapping that has not heard of it. Failing towards showing is the
 * same direction lib/staff/testAccounts.ts takes and for the same reason.
 */

/**
 * The canonical fact behind one persisted alert.
 *
 * Only the alert keys that have a client-list twin are mapped. Everything
 * else keys on itself, because an alert with no twin cannot collide with
 * anything.
 *
 * `symptoms_worsening_pain` is the pain one: `symptomsWorseningAlerts`
 * emits `symptoms_worsening_${area}` over the areas pain and digestion,
 * and the client list's own pain reason comes from `detectInsights`. They
 * are two readings of the same trend.
 */
export function findingKeyForAlert(alertKey: string): string {
  if (alertKey === 'no_checkin') return 'checkin_gap';
  if (alertKey === 'symptoms_worsening_pain') return 'pain_rising';
  return `alert:${alertKey}`;
}

/**
 * The canonical fact behind one client-list reason.
 *
 * Keyed on the exact strings the two attention modules and app/coach/lib.ts
 * export, so a reworded reason is a mapping miss that still renders rather
 * than a silent disappearance.
 */
export const FINDING_KEY_BY_REASON: Readonly<Record<string, string>> = {
  'No check-in logged today': 'checkin_gap',
  'Daily Wellness Index below threshold': 'wellness_low',
  'Sudden drop in wellness': 'wellness_drop',
  'Pain increasing': 'pain_rising',
  'Stress increasing': 'stress_rising',
  'Exercise stopped, member reported pain': 'exercise_pain_stop',
  'An exercise felt too easy, ready to progress': 'exercise_too_easy',
  'Program complete, needs review': 'program_complete',
  'Program ends this week': 'program_ending',
};

export function findingKeyForReason(reason: string): string {
  return FINDING_KEY_BY_REASON[reason] ?? `reason:${reason}`;
}

/**
 * The client-list reasons that are worth showing beside the alerts.
 *
 * Order is preserved exactly as the client list computes it, which puts
 * safety first (buildAllClientSummaries prepends the exercise feedback
 * reasons, then the program lifecycle ones). Duplicates within the
 * reasons themselves are dropped too, because two program assignments can
 * both be ending this week.
 */
export function foldAttentionReasons(input: {
  alerts: ReadonlyArray<{ alertKey: string }>;
  attentionReasons: readonly string[];
}): string[] {
  const covered = new Set(input.alerts.map((alert) => findingKeyForAlert(alert.alertKey)));
  const kept: string[] = [];
  for (const reason of input.attentionReasons) {
    const key = findingKeyForReason(reason);
    if (covered.has(key)) continue;
    covered.add(key);
    kept.push(reason);
  }
  return kept;
}
