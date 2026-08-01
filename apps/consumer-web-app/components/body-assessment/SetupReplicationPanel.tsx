'use client';

/**
 * "Guided replication" side-by-side panel — shown only when the member has
 * a previous accepted capture of this exact view (front/left_side/
 * right_side/back), fetched by app/actions/body-assessment.ts's
 * getMostRecentCaptureSetupAction. Purely presentational: CameraCapture.tsx
 * computes the target-vs-live match booleans (using the same tolerance
 * constants it uses for its own absolute reproducibility gate) and passes
 * them in — this component only renders what it's given.
 *
 * Matching the exact previous setup (not just "somewhere in the broad
 * absolute band") is what makes a before-and-after comparison meaningful:
 * two captures that both individually satisfy the absolute gate can still
 * differ from each other by most of that gate's width.
 */

export type ReplicationSetupValues = {
  rollDegrees: number | null;
  pitchDegrees: number | null;
  hipMidYRatio: number | null;
  subjectFrameHeightRatio: number | null;
};

export type ReplicationMatchState = {
  roll: boolean | null;
  pitch: boolean | null;
  hip: boolean | null;
  frameFill: boolean | null;
};

function formatDegrees(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(1)}°`;
}

function formatPercent(value: number | null): string {
  return value === null ? '-' : `${Math.round(value * 100)}%`;
}

function MatchDot({ matched }: { matched: boolean | null }) {
  if (matched === null) {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-white/25" aria-hidden="true" />;
  }
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${matched ? 'bg-emerald-400' : 'bg-amber-400'}`}
      aria-hidden="true"
    />
  );
}

function Row({
  label,
  target,
  live,
  matched,
}: {
  label: string;
  target: string;
  live: string;
  matched: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[11px]">
      <span className="w-20 shrink-0 text-white/70">{label}</span>
      <span className="flex-1 text-center text-white/90">{target}</span>
      <span className="flex-1 text-center font-medium text-white">{live}</span>
      <MatchDot matched={matched} />
    </div>
  );
}

export function SetupReplicationPanel({
  target,
  live,
  match,
  allMatched,
}: {
  target: ReplicationSetupValues;
  live: ReplicationSetupValues;
  match: ReplicationMatchState;
  allMatched: boolean;
}) {
  return (
    <div className="absolute inset-x-4 bottom-24 z-20 rounded-2xl bg-black/75 p-3">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/70">
        <span>Matching your last capture</span>
        <span className={allMatched ? 'text-emerald-400' : 'text-amber-400'}>
          {allMatched ? 'Matched' : 'Adjust to match'}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/50">
        <span className="w-20 shrink-0" />
        <span className="flex-1 text-center">Target</span>
        <span className="flex-1 text-center">Live</span>
        <span className="w-2" />
      </div>
      <Row
        label="Roll"
        target={formatDegrees(target.rollDegrees)}
        live={formatDegrees(live.rollDegrees)}
        matched={match.roll}
      />
      <Row
        label="Pitch"
        target={formatDegrees(target.pitchDegrees)}
        live={formatDegrees(live.pitchDegrees)}
        matched={match.pitch}
      />
      <Row
        label="Hip height"
        target={formatPercent(target.hipMidYRatio)}
        live={formatPercent(live.hipMidYRatio)}
        matched={match.hip}
      />
      <Row
        label="Frame fill"
        target={formatPercent(target.subjectFrameHeightRatio)}
        live={formatPercent(live.subjectFrameHeightRatio)}
        matched={match.frameFill}
      />
    </div>
  );
}
