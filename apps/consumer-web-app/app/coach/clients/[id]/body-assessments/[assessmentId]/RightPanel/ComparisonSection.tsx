'use client';

import { useRef, useState } from 'react';
import { GitCompareArrows, LayoutGrid, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  BodyAssessment,
  BodyAssessmentCapture,
  BodyAssessmentCaptureType,
  BodyAssessmentComparison,
} from '@mef/shared-types-contracts';
import { getAssessmentTypeConfig } from '@/lib/body-assessment/assessmentTypes';
import { ComparisonSummary } from '@/app/assessment/[id]/ComparisonSummary';
import { EmptyState } from './EmptyState';

export type ComparisonCapture = { capture: BodyAssessmentCapture; url: string | null };

type Pair = {
  captureType: BodyAssessmentCaptureType;
  current: ComparisonCapture;
  previous: ComparisonCapture;
};

function Pane({ item, dateLabel }: { item: ComparisonCapture; dateLabel: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-[#12241C]">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">
          {dateLabel}
        </span>
      </div>
      <div className="aspect-[3/4] w-full overflow-hidden">
        {item.url ? (
          <img src={item.url} alt="" className="h-full w-full select-none object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
            Unavailable
          </div>
        )}
      </div>
    </div>
  );
}

function SideBySideView({ pair, zoom, pan }: { pair: Pair; zoom: number; pan: { x: number; y: number } }) {
  const style = { transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` };
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="overflow-hidden" style={style}>
        <Pane item={pair.previous} dateLabel="Previous" />
      </div>
      <div className="overflow-hidden" style={style}>
        <Pane item={pair.current} dateLabel="Current" />
      </div>
    </div>
  );
}

function SliderView({ pair }: { pair: Pair }) {
  const [value, setValue] = useState(50);
  return (
    <div className="relative aspect-[3/4] w-full select-none overflow-hidden rounded-2xl bg-[#12241C]">
      {pair.previous.url && (
        <img src={pair.previous.url} alt="Previous" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      )}
      {pair.current.url && (
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
          <img src={pair.current.url} alt="Current" className="h-full w-full object-cover" draggable={false} />
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-y-0 flex w-0.5 -translate-x-1/2 items-center bg-white/90"
        style={{ left: `${value}%` }}
      >
        <span className="flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-white shadow-md">
          <MoveHorizontal className="h-3.5 w-3.5 text-[#1B3A2D]" strokeWidth={2} aria-hidden />
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        aria-label="Comparison slider"
      />
      <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
        Previous
      </span>
      <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
        Current
      </span>
    </div>
  );
}

export function ComparisonSection({
  previousAssessment,
  currentCaptures,
  previousCaptures,
  comparisonRows,
  emptyStateDescription = 'Complete another assessment for this client to unlock progress comparison.',
}: {
  previousAssessment: BodyAssessment | null;
  currentCaptures: ComparisonCapture[];
  previousCaptures: ComparisonCapture[];
  comparisonRows: BodyAssessmentComparison[];
  emptyStateDescription?: string;
}) {
  const [mode, setMode] = useState<'side' | 'slider'>('side');
  const [pairIndex, setPairIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);

  if (!previousAssessment) {
    return (
      <EmptyState icon={GitCompareArrows} title="No previous assessments" description={emptyStateDescription} />
    );
  }

  const pairs: Pair[] = currentCaptures
    .map((current) => {
      const previous = previousCaptures.find((p) => p.capture.capture_type === current.capture.capture_type);
      return previous ? { captureType: current.capture.capture_type, current, previous } : null;
    })
    .filter((p): p is Pair => p !== null);

  const activePair = pairs[pairIndex] ?? pairs[0];

  return (
    <div className="space-y-4">
      {activePair ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {pairs.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {pairs.map((pair, index) => (
                  <button
                    key={pair.captureType}
                    type="button"
                    onClick={() => setPairIndex(index)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                      index === pairIndex
                        ? 'bg-[#1B3A2D] text-white'
                        : 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D] hover:bg-[#1B3A2D]/10'
                    }`}
                  >
                    {pair.captureType.replace('_', ' ')}
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1 rounded-full bg-[#FAFAF8] p-1">
              <button
                type="button"
                title="Side by side"
                onClick={() => setMode('side')}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                  mode === 'side' ? 'bg-white shadow-sm text-[#1B3A2D]' : 'text-[#6B7A72]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                title="Slider"
                onClick={() => setMode('slider')}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                  mode === 'slider' ? 'bg-white shadow-sm text-[#1B3A2D]' : 'text-[#6B7A72]'
                }`}
              >
                <MoveHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </div>

          {mode === 'side' ? (
            <div>
              <div
                className="cursor-grab active:cursor-grabbing"
                onWheel={(e) => {
                  e.preventDefault();
                  setZoom((z) => Math.min(3, Math.max(1, +(z + (e.deltaY < 0 ? 0.2 : -0.2)).toFixed(2))));
                }}
                onPointerDown={(e) => {
                  if (zoom <= 1) return;
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pan };
                }}
                onPointerMove={(e) => {
                  if (!dragRef.current) return;
                  const { startX, startY, origin } = dragRef.current;
                  setPan({ x: origin.x + (e.clientX - startX), y: origin.y + (e.clientY - startY) });
                }}
                onPointerUp={() => (dragRef.current = null)}
                onPointerLeave={() => (dragRef.current = null)}
              >
                <SideBySideView pair={activePair} zoom={zoom} pan={pan} />
              </div>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
                >
                  <ZoomOut className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </button>
                <span className="text-[11px] text-[#6B7A72]">Synced zoom &amp; pan</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06]"
                >
                  <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <SliderView pair={activePair} />
          )}
        </>
      ) : (
        <p className="text-sm text-[#6B7A72]">
          No matching capture types between this assessment and{' '}
          {getAssessmentTypeConfig(previousAssessment.assessment_type).label} to compare visually.
        </p>
      )}

      <ComparisonSummary rows={comparisonRows} />
    </div>
  );
}
