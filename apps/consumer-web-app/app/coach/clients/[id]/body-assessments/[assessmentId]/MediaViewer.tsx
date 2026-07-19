'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pencil, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { AnnotationShape, BodyAssessmentCapture } from '@mef/shared-types-contracts';
import { saveCaptureAnnotationsAction } from '@/app/actions/body-assessment';
import { AnnotationCanvas } from './AnnotationCanvas';
import { AnnotationToolbar } from './AnnotationToolbar';
import { ANNOTATION_COLORS, type AnnotationTool } from './annotation-utils';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/**
 * Center panel — the large capture viewer. Zoom/pan is a plain CSS
 * transform on the media wrapper; the AnnotationCanvas overlay sits inside
 * that same transformed wrapper so drawn shapes zoom/pan together with the
 * image instead of needing separate coordinate math.
 *
 * Keyed by capture.id from the caller so switching captures remounts this
 * component and resets zoom/pan/draw state for free.
 */
export function MediaViewer({
  capture,
  url,
  label,
  assessmentId,
  clientId,
  initialShapes,
}: {
  capture: BodyAssessmentCapture;
  url: string | null;
  label: string;
  assessmentId: string;
  clientId: string;
  initialShapes: AnnotationShape[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panState = useRef<{
    startX: number;
    startY: number;
    origin: { x: number; y: number };
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0]);
  const [shapes, setShapes] = useState<AnnotationShape[]>(initialShapes);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isFirstRender = useRef(true);
  const shapesRef = useRef(shapes);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  function persistShapes(shapesToSave: AnnotationShape[]) {
    isDirtyRef.current = false;
    return saveCaptureAnnotationsAction({
      captureId: capture.id,
      assessmentId,
      clientId,
      shapes: shapesToSave,
    });
  }

  useEffect(() => {
    shapesRef.current = shapes;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    isDirtyRef.current = true;
    setSaveState('saving');
    const timeout = setTimeout(() => {
      persistShapes(shapes).then((result) => setSaveState(result.error ? 'idle' : 'saved'));
    }, 900);
    return () => clearTimeout(timeout);
  }, [shapes]);

  // Flushes an edit still sitting in the 900ms debounce when the coach switches
  // captures fast enough to unmount this component before the timer fires —
  // otherwise that annotation is silently dropped (MediaViewer remounts fresh
  // per capture via `key={capture.id}` in ReviewWorkspace).
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) persistShapes(shapesRef.current);
    };
  }, []);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }

  function adjustZoom(delta: number) {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2)));
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function handleWheel(e: React.WheelEvent) {
    if (isDrawMode) return;
    e.preventDefault();
    adjustZoom(e.deltaY < 0 ? 0.25 : -0.25);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (isDrawMode || zoom <= 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    panState.current = { startX: e.clientX, startY: e.clientY, origin: pan };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!panState.current) return;
    const { startX, startY, origin } = panState.current;
    setPan({ x: origin.x + (e.clientX - startX), y: origin.y + (e.clientY - startY) });
  }

  function handlePointerUp() {
    panState.current = null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-[28px] bg-[#12241C] shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] ${
        isFullscreen ? 'p-4' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 p-3">
        <p className="truncate text-sm font-medium capitalize text-white/85">{label}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title="Zoom out"
            onClick={() => adjustZoom(-0.25)}
            disabled={zoom <= MIN_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 disabled:opacity-30"
          >
            <ZoomOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Zoom in"
            onClick={() => adjustZoom(0.25)}
            disabled={zoom >= MAX_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 disabled:opacity-30"
          >
            <ZoomIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          {zoom > MIN_ZOOM && (
            <button
              type="button"
              title="Reset zoom"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            title={isDrawMode ? 'Exit annotation mode' : 'Annotate'}
            onClick={() => setIsDrawMode((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
              isDrawMode ? 'bg-[#F5B700] text-[#1B3A2D]' : 'text-white/70 hover:bg-white/10'
            }`}
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Maximize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 overflow-hidden"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: isDrawMode ? 'crosshair' : zoom > 1 ? 'grab' : 'default' }}
      >
        <div
          className="relative mx-auto flex h-full w-full items-center justify-center transition-transform duration-150 ease-out"
          style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
        >
          {url ? (
            // inline-block shrink-wraps to the media's rendered box (letterboxed by
            // max-h-full/max-w-full inside a taller/wider flex parent), so the
            // absolutely-positioned AnnotationCanvas below lines up exactly with the
            // image instead of the whole (possibly larger) viewer panel.
            <div className="relative inline-block max-h-full max-w-full leading-none">
              {capture.media_type === 'video' ? (
                <video src={url} controls className="block max-h-full max-w-full" />
              ) : (
                <img
                  src={url}
                  alt={label}
                  className="block max-h-full max-w-full select-none"
                  draggable={false}
                />
              )}
              <AnnotationCanvas
                shapes={shapes}
                activeTool={isDrawMode ? tool : 'select'}
                activeColor={color}
                onShapesChange={setShapes}
                readOnly={!isDrawMode}
              />
            </div>
          ) : (
            <p className="text-sm text-white/50">This capture is unavailable.</p>
          )}
        </div>
      </div>

      {isDrawMode && (
        <div className="p-3">
          <AnnotationToolbar
            tool={tool}
            onToolChange={setTool}
            color={color}
            onColorChange={setColor}
            onUndo={() => setShapes((prev) => prev.slice(0, -1))}
            onClear={() => setShapes([])}
            canUndo={shapes.length > 0}
            canClear={shapes.length > 0}
            saveState={saveState}
          />
        </div>
      )}
    </div>
  );
}
