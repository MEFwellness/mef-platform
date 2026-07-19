'use client';

import {
  MousePointer2,
  Minus,
  ArrowUpRight,
  Circle,
  Type,
  PenTool,
  Undo2,
  Trash2,
} from 'lucide-react';
import { ANNOTATION_COLORS, type AnnotationTool } from './annotation-utils';

const TOOLS: { tool: AnnotationTool; icon: typeof MousePointer2; label: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select' },
  { tool: 'line', icon: Minus, label: 'Line' },
  { tool: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { tool: 'circle', icon: Circle, label: 'Circle' },
  { tool: 'text', icon: Type, label: 'Text' },
  { tool: 'freedraw', icon: PenTool, label: 'Free draw' },
];

export function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  onUndo,
  onClear,
  canUndo,
  canClear,
  saveState,
}: {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canClear: boolean;
  saveState: 'idle' | 'saving' | 'saved';
}) {
  return (
    <div className="mef-animate-in flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 p-2 shadow-[0_4px_20px_-4px_rgba(27,58,45,0.18)] backdrop-blur">
      <div className="flex items-center gap-1 rounded-xl bg-[#FAFAF8] p-1">
        {TOOLS.map(({ tool: t, icon: Icon, label }) => (
          <button
            key={t}
            type="button"
            title={label}
            onClick={() => onToolChange(t)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 ${
              tool === t
                ? 'bg-[#1B3A2D] text-white shadow-sm'
                : 'text-[#6B7A72] hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 px-1">
        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onColorChange(c)}
            className={`h-5 w-5 rounded-full transition-transform duration-150 ${
              color === c ? 'scale-110 ring-2 ring-offset-1 ring-[#1B3A2D]/40' : 'hover:scale-105'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          title="Undo"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7A72] transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Clear all"
          onClick={onClear}
          disabled={!canClear}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7A72] transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span className="ml-1 min-w-[46px] text-right text-[11px] font-medium text-[#6B7A72]">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
        </span>
      </div>
    </div>
  );
}
