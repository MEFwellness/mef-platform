import type { AnnotationShapeType } from '@mef/shared-types-contracts';

export const ANNOTATION_COLORS = [
  '#F5B700', // accent yellow — default
  '#DC2626', // red — flag a concern
  '#2563EB', // blue — neutral marker
  '#1B3A2D', // deep green — matches the app ink
] as const;

export const DEFAULT_STROKE_WIDTH = 0.6; // in normalized [0,1] viewBox units

export type AnnotationTool = 'select' | AnnotationShapeType;

export const TOOL_LABELS: Record<AnnotationShapeType, string> = {
  line: 'Line',
  arrow: 'Arrow',
  circle: 'Circle',
  text: 'Text',
  freedraw: 'Free draw',
};

export function createShapeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `shape-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
