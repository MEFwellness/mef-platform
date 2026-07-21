/** Grid-shaped loading placeholder shown while a search is in flight — mirrors ExerciseCard's own shape (media block + two text lines) so the transition into real results doesn't reflow, same `animate-pulse` idiom as components/PageSkeleton.tsx. */
export function ExerciseCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[#1B3A2D]/10 bg-white">
      <div className="aspect-[4/3] w-full animate-pulse bg-[#1B3A2D]/[0.06]" />
      <div className="flex flex-col gap-2 p-3.5">
        <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-[#1B3A2D]/[0.08]" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-[#1B3A2D]/[0.06]" />
      </div>
    </div>
  );
}

export function ExerciseGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ExerciseCardSkeleton key={i} />
      ))}
    </div>
  );
}
