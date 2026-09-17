'use client';

/**
 * The Health Appraisal's final step: the body map.
 *
 * OPTIONAL, AND IT SAYS SO. Finishing with nothing marked is a complete,
 * correct answer, so Complete is never disabled here for want of a mark.
 *
 * A MARK IS ONE AREA, ONE VIEW, ONE CATEGORY. She taps an area on the front
 * or the back, chooses Pain, Swelling, Discomfort or Skin change, and the
 * mark is saved at once. The same area can carry more than one category;
 * the same category twice on one area is one mark. Every mark is listed
 * under the figure with a Remove button, and tapping a marked category again
 * in the sheet removes it too.
 *
 * NEUTRAL. Every mark is drawn in the same muted gold whatever it says, so
 * nothing on the figure reads as better or worse than anything else.
 *
 * SMALL AREAS HAVE A LARGE WAY IN. An elbow on a phone is a small target, so
 * the same areas are offered as a plain list of full width rows, one tap
 * away.
 *
 * The parent owns the marks and the saving; this component draws and asks.
 */

import { useState, type KeyboardEvent } from 'react';
import { Check, X } from 'lucide-react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import {
  HAQ_BODY_ISSUE_TYPES,
  haqBodyIssueLabel,
  haqBodyMarkPlace,
  haqBodyRegions,
  type HaqBodyIssueType,
  type HaqBodyMark,
  type HaqBodyRegion,
  type HaqBodyShape,
  type HaqBodySide,
} from '@/lib/haq/bodyMap';
import {
  HAQ_BODY_MAP_BACK_LABEL,
  HAQ_BODY_MAP_CANCEL_LABEL,
  HAQ_BODY_MAP_CHOOSE_CATEGORY,
  HAQ_BODY_MAP_FIGURE_TOGGLE,
  HAQ_BODY_MAP_FRONT_LABEL,
  HAQ_BODY_MAP_INSTRUCTION,
  HAQ_BODY_MAP_LIST_TOGGLE,
  HAQ_BODY_MAP_MARKS_HEADING,
  HAQ_BODY_MAP_NO_MARKS,
  HAQ_BODY_MAP_OPTIONAL_LINE,
  HAQ_BODY_MAP_REMOVE_LABEL,
  HAQ_BODY_MAP_SIDES_HINT,
  HAQ_BODY_MAP_TITLE,
} from '@/lib/haq/copy';

function Shape({ shape, className }: { shape: HaqBodyShape; className: string }) {
  if (shape.kind === 'ellipse') {
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} className={className} />;
  }
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rx={shape.radius}
      ry={shape.radius}
      className={className}
    />
  );
}

export function HaqBodyMap({
  marks,
  busy,
  error,
  onAdd,
  onRemove,
}: {
  marks: HaqBodyMark[];
  busy: boolean;
  error: string | null;
  onAdd: (mark: { location: string; side: HaqBodySide; issueType: HaqBodyIssueType }) => void;
  onRemove: (markId: string) => void;
}) {
  const [view, setView] = useState<HaqBodySide>('front');
  const [asList, setAsList] = useState(false);
  const [chosen, setChosen] = useState<HaqBodyRegion | null>(null);

  const regions = haqBodyRegions(view);
  const markedHere = (location: string) => marks.filter((m) => m.side === view && m.location === location);

  function openRegion(region: HaqBodyRegion) {
    if (!busy) setChosen(region);
  }

  function onRegionKey(event: KeyboardEvent<SVGGElement>, region: HaqBodyRegion) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openRegion(region);
    }
  }

  return (
    <div data-testid="haq-body-map">
      <h1 className={`${CVS_DISPLAY_FONT} text-[30px] leading-tight text-[#1B3A2D]`}>{HAQ_BODY_MAP_TITLE}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{HAQ_BODY_MAP_INSTRUCTION}</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B7A72]">{HAQ_BODY_MAP_OPTIONAL_LINE}</p>

      <div className="mt-5 flex rounded-2xl bg-[#1B3A2D]/[0.06] p-1" role="group" aria-label="Body view">
        {(['front', 'back'] as const).map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={view === side}
            onClick={() => setView(side)}
            className={`mef-press mef-focus-ring min-h-[44px] flex-1 rounded-xl text-sm font-semibold transition ${
              view === side ? 'bg-white text-[#1B3A2D] shadow-sm' : 'text-[#6B7A72]'
            }`}
          >
            {side === 'front' ? HAQ_BODY_MAP_FRONT_LABEL : HAQ_BODY_MAP_BACK_LABEL}
          </button>
        ))}
      </div>

      <p className="mt-3 text-center text-[13px] text-[#6B7A72]">{HAQ_BODY_MAP_SIDES_HINT}</p>

      {asList ? (
        <ul className="mt-4 space-y-2" data-testid="haq-body-map-list">
          {regions.map((region) => (
            <li key={region.location}>
              <button
                type="button"
                onClick={() => openRegion(region)}
                data-location={region.location}
                className="mef-press mef-focus-ring flex min-h-[48px] w-full items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/12 bg-[#F1F6F2] px-4 text-left text-[15px] text-[#1B3A2D]"
              >
                <span>{region.label}</span>
                {markedHere(region.location).length > 0 && (
                  <Check className="h-4 w-4 shrink-0 text-[#B08F3E]" strokeWidth={2.25} aria-label="Marked" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 flex justify-center">
          <svg
            viewBox="0 0 200 392"
            className="h-auto w-full max-w-[300px]"
            role="group"
            aria-label={view === 'front' ? 'Front of the body' : 'Back of the body'}
            data-testid={`haq-body-figure-${view}`}
          >
            {regions.map((region) => {
              const marked = markedHere(region.location).length > 0;
              return (
                <g
                  key={region.location}
                  role="button"
                  tabIndex={0}
                  aria-label={marked ? `${region.label}, marked` : region.label}
                  data-location={region.location}
                  onClick={() => openRegion(region)}
                  onKeyDown={(event) => onRegionKey(event, region)}
                  className="mef-focus-ring cursor-pointer outline-none"
                >
                  <Shape
                    shape={region.shape}
                    className={
                      marked
                        ? 'fill-[#C4A050]/60 stroke-[#B08F3E] [stroke-width:1.5]'
                        : 'fill-[#E4ECE6] stroke-[#1B3A2D]/25 [stroke-width:1] hover:fill-[#D6E3D9]'
                    }
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={() => setAsList((value) => !value)}
          className="mef-focus-ring min-h-[44px] rounded-lg px-3 text-sm font-medium text-[#1B3A2D] underline decoration-[#C4A050] underline-offset-4"
        >
          {asList ? HAQ_BODY_MAP_FIGURE_TOGGLE : HAQ_BODY_MAP_LIST_TOGGLE}
        </button>
      </div>

      <section className="mt-6" aria-labelledby="haq-marks-heading">
        <h2 id="haq-marks-heading" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#6B7A72]">
          {HAQ_BODY_MAP_MARKS_HEADING}
        </h2>
        {marks.length === 0 ? (
          <p className="mt-2 text-[14px] text-[#6B7A72]">{HAQ_BODY_MAP_NO_MARKS}</p>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="haq-body-marks">
            {marks.map((mark) => (
              <li
                key={mark.id}
                data-mark-id={mark.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/10 bg-white px-4 py-2.5"
              >
                <span className="text-[14.5px] leading-snug text-[#1B3A2D]">
                  {haqBodyMarkPlace(mark)}
                  <span className="block text-[13px] text-[#6B7A72]">{haqBodyIssueLabel(mark.issueType)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(mark.id)}
                  disabled={busy}
                  className="mef-press mef-focus-ring min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-medium text-[#1B3A2D] underline decoration-[#1B3A2D]/30 underline-offset-4 disabled:opacity-50"
                >
                  {HAQ_BODY_MAP_REMOVE_LABEL}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="mt-3 text-sm text-[#8A4B2A]" role="alert">
            {error}
          </p>
        )}
      </section>

      {chosen && (
        <HaqBodyCategorySheet
          region={chosen}
          view={view}
          marked={markedHere(chosen.location)}
          busy={busy}
          onChoose={(issueType) => {
            const existing = markedHere(chosen.location).find((m) => m.issueType === issueType);
            if (existing) onRemove(existing.id);
            else onAdd({ location: chosen.location, side: view, issueType });
            setChosen(null);
          }}
          onClose={() => setChosen(null)}
        />
      )}
    </div>
  );
}

function HaqBodyCategorySheet({
  region,
  view,
  marked,
  busy,
  onChoose,
  onClose,
}: {
  region: HaqBodyRegion;
  view: HaqBodySide;
  marked: HaqBodyMark[];
  busy: boolean;
  onChoose: (issueType: HaqBodyIssueType) => void;
  onClose: () => void;
}) {
  useBodyScrollLock(true);

  return (
    <ModalOverlay testId="haq-body-category-sheet" zIndexClassName="z-[70]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="haq-category-title"
        className="mef-animate-in my-6 w-full max-w-md rounded-[28px] bg-[#FFFDF8] p-6 shadow-[0_24px_60px_-24px_rgba(27,58,45,0.55)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="haq-category-title" className={`${CVS_DISPLAY_FONT} text-[24px] leading-tight text-[#1B3A2D]`}>
            {region.label}
            <span className="block text-[14px] font-normal text-[#6B7A72]">
              {view === 'front' ? HAQ_BODY_MAP_FRONT_LABEL : HAQ_BODY_MAP_BACK_LABEL}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={HAQ_BODY_MAP_CANCEL_LABEL}
            className="mef-focus-ring mef-press -mr-1 -mt-1 rounded-full p-2 text-[#6B7A72] hover:bg-[#F3F6F4]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-[14px] text-[#6B7A72]">{HAQ_BODY_MAP_CHOOSE_CATEGORY}</p>
        <ul className="mt-4 space-y-2.5">
          {HAQ_BODY_ISSUE_TYPES.map((issue) => {
            const on = marked.some((m) => m.issueType === issue.value);
            return (
              <li key={issue.value}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  data-issue-type={issue.value}
                  onClick={() => onChoose(issue.value)}
                  className={`mef-press mef-focus-ring flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border px-5 text-left text-[15px] transition disabled:opacity-60 ${
                    on
                      ? 'border-[#B08F3E] bg-[#C4A050] font-semibold text-[#173025]'
                      : 'border-[#1B3A2D]/12 bg-[#F1F6F2] text-[#1B3A2D] hover:border-[#C4A050]/45'
                  }`}
                >
                  <span>{issue.label}</span>
                  {on && <Check className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mef-press mef-focus-ring mt-5 block min-h-[48px] w-full rounded-2xl border border-[#1B3A2D]/15 text-sm font-semibold text-[#1B3A2D]"
        >
          {HAQ_BODY_MAP_CANCEL_LABEL}
        </button>
      </div>
    </ModalOverlay>
  );
}
