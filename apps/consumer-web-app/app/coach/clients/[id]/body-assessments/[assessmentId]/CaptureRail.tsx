'use client';

import { Circle, Film, ImageOff } from 'lucide-react';
import type { BodyAssessmentCapture } from '@mef/shared-types-contracts';

export type RailCapture = {
  capture: BodyAssessmentCapture;
  url: string | null;
  hasAnnotations: boolean;
  label: string;
};

/**
 * Left panel — every capture in the assessment, selectable, with an
 * annotation indicator dot. Grouping by capture_type label (front/left
 * side/etc. for static posture, "Movement" for gait/mobility video) mirrors
 * getAssessmentTypeConfig's step order since captures are already returned
 * in sequence_index order.
 */
export function CaptureRail({
  captures,
  selectedCaptureId,
  onSelect,
}: {
  captures: RailCapture[];
  selectedCaptureId: string | null;
  onSelect: (captureId: string) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {captures.map(({ capture, url, hasAnnotations, label }, index) => {
        const isSelected = capture.id === selectedCaptureId;
        return (
          <button
            key={capture.id}
            type="button"
            onClick={() => onSelect(capture.id)}
            style={{ animationDelay: `${index * 45}ms` }}
            className={`mef-animate-in group relative w-24 shrink-0 overflow-hidden rounded-2xl bg-white text-left shadow-[0_2px_16px_-4px_rgba(27,58,45,0.10)] transition-all duration-200 lg:w-full ${
              isSelected
                ? 'ring-2 ring-[#F5B700] ring-offset-2 ring-offset-[#FAFAF8]'
                : 'ring-1 ring-[#1B3A2D]/[0.06] hover:ring-[#1B3A2D]/20'
            }`}
          >
            <div className="relative aspect-square w-full bg-[#1B3A2D]/[0.04]">
              {url ? (
                capture.media_type === 'video' ? (
                  <video
                    src={url}
                    muted
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <img
                    src={url}
                    alt={label}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#6B7A72]">
                  <ImageOff className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                </div>
              )}

              {capture.media_type === 'video' && (
                <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/55 p-1 text-white backdrop-blur-sm">
                  <Film className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                </span>
              )}

              {hasAnnotations && (
                <span
                  className="absolute left-1.5 top-1.5 rounded-full bg-[#F5B700] p-0.5 shadow-sm"
                  title="Has annotations"
                >
                  <Circle className="h-2 w-2 fill-current text-[#1B3A2D]" aria-hidden="true" />
                </span>
              )}
            </div>
            <p className="truncate p-2 text-center text-xs font-medium capitalize text-[#1B3A2D]">
              {label}
            </p>
          </button>
        );
      })}
    </div>
  );
}
