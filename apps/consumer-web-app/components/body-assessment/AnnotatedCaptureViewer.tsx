'use client';

/**
 * Member-facing, read-only capture viewer — a thumbnail (with the coach's
 * saved annotation shapes overlaid) that expands into a zoomable fullscreen
 * view on tap. Reuses AnnotationCanvas exactly as-is in readOnly mode (the
 * same component the coach's MediaViewer uses for drawing) — no new
 * annotation rendering logic, and no coach-only editing chrome (toolbar,
 * save state, draw mode) since a member session can view but never edit.
 */

import { useState } from 'react';
import { Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { AnnotationShape, BodyAssessmentCapture } from '@mef/shared-types-contracts';
import { AnnotationCanvas } from '@/app/coach/clients/[id]/body-assessments/[assessmentId]/AnnotationCanvas';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function AnnotatedCaptureViewer({
  capture,
  url,
  shapes,
  label,
}: {
  capture: BodyAssessmentCapture;
  url: string | null;
  shapes: AnnotationShape[];
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  return (
    <>
      <button
        type="button"
        onClick={() => url && setIsOpen(true)}
        className="group relative overflow-hidden rounded-2xl bg-white text-left shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]"
      >
        <div className="relative aspect-square w-full bg-black/5">
          {url ? (
            capture.media_type === 'video' ? (
              <video src={url} className="h-full w-full object-cover" />
            ) : (
              <>
                <img src={url} alt={label} className="h-full w-full object-cover" />
                {shapes.length > 0 && (
                  <div className="absolute inset-0">
                    <AnnotationCanvas
                      shapes={shapes}
                      activeTool="select"
                      activeColor="#F5B700"
                      onShapesChange={() => {}}
                      readOnly
                    />
                  </div>
                )}
              </>
            )
          ) : null}
          {url && capture.media_type !== 'video' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100">
              <Maximize2 className="h-5 w-5 text-white" strokeWidth={1.75} aria-hidden="true" />
            </div>
          )}
        </div>
        <p className="p-2 text-center text-xs font-medium capitalize text-[#1B3A2D]">
          {capture.capture_type.replace('_', ' ')}
        </p>
      </button>

      {isOpen && url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="fixed inset-0 z-50 flex flex-col bg-[#12241C]"
        >
          <div className="flex items-center justify-between gap-2 p-3">
            <p className="truncate text-sm font-medium capitalize text-white/85">{label}</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title="Zoom out"
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)))}
                disabled={zoom <= MIN_ZOOM}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 disabled:opacity-30"
              >
                <ZoomOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Zoom in"
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))}
                disabled={zoom >= MAX_ZOOM}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 disabled:opacity-30"
              >
                <ZoomIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Close"
                onClick={() => {
                  setIsOpen(false);
                  setZoom(1);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
            <div
              className="relative inline-block max-h-full max-w-full leading-none transition-transform duration-150 ease-out"
              style={{ transform: `scale(${zoom})` }}
            >
              <img src={url} alt={label} className="block max-h-[80vh] max-w-full select-none" draggable={false} />
              {shapes.length > 0 && (
                <div className="absolute inset-0">
                  <AnnotationCanvas
                    shapes={shapes}
                    activeTool="select"
                    activeColor="#F5B700"
                    onShapesChange={() => {}}
                    readOnly
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
