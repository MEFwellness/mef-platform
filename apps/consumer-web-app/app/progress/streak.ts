/**
 * Pulled out of app/progress/page.tsx: a Next.js App Router page file can
 * only export the route conventions it recognizes (default, metadata,
 * etc.) — an arbitrary named export like this one breaks the generated
 * route types. Same function, same behavior, just importable from a
 * plain module so both the page and its tests can use it.
 */
export function calculateStreak(checkinsOldestFirst: { local_date: string }[]): number {
  if (checkinsOldestFirst.length === 0) return 0;

  let streak = 1;
  for (let i = checkinsOldestFirst.length - 1; i > 0; i--) {
    const current = new Date(checkinsOldestFirst[i]!.local_date);
    const previous = new Date(checkinsOldestFirst[i - 1]!.local_date);
    const dayDiff = Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}
