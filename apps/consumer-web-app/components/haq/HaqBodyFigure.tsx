/**
 * The body map's drawing, with nothing to tap.
 *
 * ONE FIGURE, TWO READERS. The member marks her areas on it
 * (components/haq/HaqBodyMap.tsx) and her coach reads what she marked on the
 * same shapes, so the elbow he is looking at is the elbow she tapped. The
 * shape renderer lives here rather than inside her interactive map, because
 * two copies of a figure drift and then the two screens disagree about where
 * a mark is.
 *
 * NOTHING SCORED IS ANYWHERE NEAR IT. A body map mark never reaches a
 * section total (migration 262's engine does not read the table), so this
 * component takes only locations and knows nothing else.
 *
 * LEFT AND RIGHT ARE HERS. The regions come from lib/haq/bodyMap.ts, which
 * has already turned the side of the picture into her own left or right for
 * the view being drawn.
 */

import { haqBodyRegions, type HaqBodyShape, type HaqBodySide } from '@/lib/haq/bodyMap';

export function HaqBodyShapeMark({ shape, className }: { shape: HaqBodyShape; className: string }) {
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

/** One view, read only: every area drawn, and the marked ones filled. */
export function HaqBodyFigure({
  side,
  markedLocations,
}: {
  side: HaqBodySide;
  markedLocations: readonly string[];
}) {
  const marked = new Set(markedLocations);
  return (
    <svg
      viewBox="0 0 200 392"
      className="h-auto w-full max-w-[220px]"
      role="img"
      aria-label={side === 'front' ? 'Front of the body' : 'Back of the body'}
      data-testid={`haq-body-reading-${side}`}
    >
      {haqBodyRegions(side).map((region) => (
        <HaqBodyShapeMark
          key={region.location}
          shape={region.shape}
          className={
            marked.has(region.location)
              ? 'fill-[#C4A050]/60 stroke-[#B08F3E] [stroke-width:1.5]'
              : 'fill-[#E4ECE6] stroke-[#1B3A2D]/25 [stroke-width:1]'
          }
        />
      ))}
    </svg>
  );
}
