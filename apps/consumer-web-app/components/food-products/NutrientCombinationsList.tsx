import type { NutrientCombinationFinding } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SEVERITY_STYLE: Record<NutrientCombinationFinding['severity'], string> = {
  informational: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]',
  worth_noting: 'bg-[#F5B700]/15 text-[#854D0E]',
  meaningful: 'bg-[#F5B700]/25 text-[#854D0E]',
};

const SEVERITY_LABEL: Record<NutrientCombinationFinding['severity'], string> = {
  informational: 'Worth knowing',
  worth_noting: 'Worth noting',
  meaningful: 'More notable',
};

/** The nutrient-combination differentiator (product requirement §11) — deliberately reserves red/alarm-style coloring for genuine safety concerns elsewhere (AllergenAlert, partially hydrogenated oil); combination findings use warm amber, never red, per §14's "avoid excessive red." */
export function NutrientCombinationsList({ findings }: { findings: NutrientCombinationFinding[] }) {
  if (findings.length === 0) return null;

  return (
    <div className={`${CARD} p-6`}>
      <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        How these nutrients work together
      </p>
      <div className="space-y-3">
        {findings.map((f, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[f.severity]}`}
            >
              {SEVERITY_LABEL[f.severity]}
            </span>
            <p className="text-sm leading-relaxed text-[#1B3A2D]">{f.narrative}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
