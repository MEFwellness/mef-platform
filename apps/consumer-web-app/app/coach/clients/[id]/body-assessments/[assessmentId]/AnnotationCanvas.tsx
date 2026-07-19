'use client';

import { useRef, useState } from 'react';
import type { AnnotationShape, AnnotationPoint } from '@mef/shared-types-contracts';
import { createShapeId, DEFAULT_STROKE_WIDTH, type AnnotationTool } from './annotation-utils';

const VB = 100; // viewBox is 0..100 on both axes; shapes store normalized [0,1] and get scaled by VB for rendering.

function toViewBox(p: AnnotationPoint) {
  return { x: p.x * VB, y: p.y * VB };
}

function normalize(clientX: number, clientY: number, rect: DOMRect): AnnotationPoint {
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
  };
}

function ShapeRenderer({ shape }: { shape: AnnotationShape }) {
  const pts = shape.points.map(toViewBox);
  const stroke = shape.color;
  const width = shape.strokeWidth;

  if (shape.type === 'line' || shape.type === 'arrow') {
    const [a, b] = pts;
    if (!a || !b) return null;
    return (
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        markerEnd={shape.type === 'arrow' ? `url(#mef-arrowhead-${shape.id})` : undefined}
      />
    );
  }

  if (shape.type === 'circle') {
    const [center, edge] = pts;
    if (!center || !edge) return null;
    // Rendered as an ellipse with independent rx/ry rather than a true circle
    // (Math.hypot on a single radius) — the viewBox is 0..100 on both axes but
    // preserveAspectRatio="none" stretches it to the media's actual (non-square)
    // box, so a single normalized radius would draw visibly lopsided. This way
    // the shape always matches the box the coach actually dragged.
    return (
      <ellipse
        cx={center.x}
        cy={center.y}
        rx={Math.abs(edge.x - center.x)}
        ry={Math.abs(edge.y - center.y)}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
      />
    );
  }

  if (shape.type === 'freedraw') {
    if (pts.length < 2) return null;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    return (
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (shape.type === 'text') {
    const [anchor] = pts;
    if (!anchor || !shape.text) return null;
    return (
      <text
        x={anchor.x}
        y={anchor.y}
        fill={stroke}
        fontSize={4.2}
        fontWeight={600}
        paintOrder="stroke"
      >
        {shape.text}
      </text>
    );
  }

  return null;
}

/**
 * SVG overlay: renders saved shapes always, and (when not readOnly) handles
 * pointer-driven creation of new shapes in the active tool. Coordinates are
 * normalized [0,1] in the shape data (same convention as body_landmark_sets)
 * so annotations stay correctly positioned regardless of the parent's zoom
 * transform — the overlay simply scales 1:1 with the media it sits on.
 */
export function AnnotationCanvas({
  shapes,
  activeTool,
  activeColor,
  onShapesChange,
  readOnly = false,
}: {
  shapes: AnnotationShape[];
  activeTool: AnnotationTool;
  activeColor: string;
  onShapesChange: (shapes: AnnotationShape[]) => void;
  readOnly?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<AnnotationShape | null>(null);
  const [pendingText, setPendingText] = useState<{ point: AnnotationPoint } | null>(null);

  function getRect(): DOMRect | null {
    return svgRef.current?.getBoundingClientRect() ?? null;
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (readOnly || activeTool === 'select') return;
    const rect = getRect();
    if (!rect) return;
    const point = normalize(e.clientX, e.clientY, rect);

    if (activeTool === 'text') {
      setPendingText({ point });
      return;
    }

    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft({
      id: createShapeId(),
      type: activeTool,
      points: activeTool === 'freedraw' ? [point] : [point, point],
      color: activeColor,
      strokeWidth: DEFAULT_STROKE_WIDTH,
    });
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!draft) return;
    const rect = getRect();
    if (!rect) return;
    const point = normalize(e.clientX, e.clientY, rect);

    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.type === 'freedraw') {
        return { ...prev, points: [...prev.points, point] };
      }
      const start = prev.points[0] ?? point;
      return { ...prev, points: [start, point] };
    });
  }

  function commitDraft() {
    if (!draft) return;
    const [start, end] = draft.points;
    const isDegenerate =
      draft.type === 'freedraw'
        ? draft.points.length < 2
        : start !== undefined &&
          end !== undefined &&
          Math.hypot(end.x - start.x, end.y - start.y) < 0.01;
    if (!isDegenerate) {
      onShapesChange([...shapes, draft]);
    }
    setDraft(null);
  }

  function commitText(text: string) {
    if (pendingText && text.trim()) {
      onShapesChange([
        ...shapes,
        {
          id: createShapeId(),
          type: 'text',
          points: [pendingText.point],
          color: activeColor,
          strokeWidth: DEFAULT_STROKE_WIDTH,
          text: text.trim(),
        },
      ]);
    }
    setPendingText(null);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB} ${VB}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 h-full w-full ${
        readOnly || activeTool === 'select' ? 'pointer-events-none' : 'touch-none'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={commitDraft}
      onPointerLeave={commitDraft}
    >
      <defs>
        {shapes
          .filter((s) => s.type === 'arrow')
          .map((s) => (
            <marker
              key={s.id}
              id={`mef-arrowhead-${s.id}`}
              markerWidth="3"
              markerHeight="3"
              refX="2.2"
              refY="1.5"
              orient="auto"
            >
              <path d="M0,0 L3,1.5 L0,3 Z" fill={s.color} />
            </marker>
          ))}
      </defs>

      {shapes.map((shape) => (
        <ShapeRenderer key={shape.id} shape={shape} />
      ))}
      {draft && <ShapeRenderer shape={draft} />}

      {pendingText && (
        <foreignObject
          x={pendingText.point.x * VB - 15}
          y={pendingText.point.y * VB - 3}
          width={30}
          height={8}
        >
          <input
            autoFocus
            className="w-full rounded border border-[#F5B700] bg-white px-1 text-[3.2px] leading-none text-[#1B3A2D] outline-none"
            style={{ fontSize: '4px' }}
            onBlur={(e) => commitText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setPendingText(null);
            }}
          />
        </foreignObject>
      )}
    </svg>
  );
}
