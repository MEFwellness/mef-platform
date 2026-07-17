const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function ObservationCard({
  title,
  badge,
  observations,
}: {
  title: string;
  badge?: string | undefined;
  observations: string[];
}) {
  return (
    <div className={`${CARD} p-6`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">{title}</p>
        {badge && (
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
            {badge}
          </span>
        )}
      </div>
      {observations.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {observations.map((o, i) => (
            <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
              {o}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#6B7A72]">Not enough data to evaluate this.</p>
      )}
    </div>
  );
}
