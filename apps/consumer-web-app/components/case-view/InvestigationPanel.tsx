import type { DriverCaseView, InvestigationPanelView } from '@/lib/case-view/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function DriverChip({ driver, variant }: { driver: DriverCaseView; variant: 'active' | 'ruled_out' | 'implicated' }) {
  const style =
    variant === 'ruled_out'
      ? 'border-[#1B3A2D]/10 bg-[#FAFAF8] text-[#9AA79F] line-through decoration-[#9AA79F]/50'
      : variant === 'implicated'
        ? 'border-[#B08900]/30 bg-[#FDF2E3] text-[#8A5A1F]'
        : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D]';

  return (
    <div className={`rounded-2xl border px-3.5 py-2.5 text-[13px] ${style}`}>
      <p className="font-medium">{driver.label}</p>
      <p className={`text-[11px] ${variant === 'ruled_out' ? 'text-[#9AA79F]' : 'text-[#6B7A72]'}`}>{driver.domainLabel}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  drivers,
  variant,
}: {
  title: string;
  subtitle: string;
  drivers: DriverCaseView[];
  variant: 'active' | 'ruled_out' | 'implicated';
}) {
  if (drivers.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-medium text-[#1B3A2D]">{title}</p>
      <p className="text-[12px] text-[#6B7A72]">{subtitle}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {drivers.map((d) => (
          <DriverChip key={d.driverId} driver={d} variant={variant} />
        ))}
      </div>
    </div>
  );
}

export function InvestigationPanel({ panel }: { panel: InvestigationPanelView }) {
  const hasAnything =
    panel.beingLookedAt.length + panel.ruledOut.length + panel.likelyInvolved.length + panel.notYetTrackable.length > 0;

  if (!hasAnything) return null;

  return (
    <div className={`${CARD} space-y-6 p-6`}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">The investigation</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6B7A72]">
          What we&apos;re looking at as possible root causes for what you came for, and what&apos;s already been
          ruled out.
        </p>
      </div>

      <Section
        title="Flagged as likely involved"
        subtitle="A real relationship has shown up consistently enough to trust"
        drivers={panel.likelyInvolved}
        variant="implicated"
      />
      <Section
        title="Currently being looked at"
        subtitle="Still gathering enough evidence to say either way"
        drivers={panel.beingLookedAt}
        variant="active"
      />
      <Section
        title="Ruled out"
        subtitle="Tested, and no meaningful relationship was found"
        drivers={panel.ruledOut}
        variant="ruled_out"
      />

      {panel.notYetTrackable.length > 0 && (
        <div className="border-t border-[#1B3A2D]/[0.06] pt-4">
          <p className="text-[12px] text-[#9AA79F]">
            Not trackable yet: {panel.notYetTrackable.map((d) => d.label).join(', ')}. There&apos;s no daily way
            to measure {panel.notYetTrackable.length === 1 ? 'this one' : 'these'} yet, so no investigation has
            started.
          </p>
        </div>
      )}
    </div>
  );
}
