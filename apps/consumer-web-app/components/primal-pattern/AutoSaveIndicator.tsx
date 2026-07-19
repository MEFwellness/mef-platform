/**
 * Small, calm auto-save status indicator for the premium take flow.
 * Reuses the existing mef-pulse-dot keyframe (globals.css) rather than
 * introducing a new animation, matching that utility's own stated
 * purpose: "a slow, calm breathing pulse signaling waiting."
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const COPY: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving',
  saved: 'Saved',
  error: "Couldn't save. Retrying...",
};

export function AutoSaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return <span aria-live="polite" className="sr-only" />;

  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
        status === 'error' ? 'text-red-600' : 'text-[#6B7A72]'
      }`}
    >
      {status === 'saving' && (
        <span className="mef-pulse-dot h-1.5 w-1.5 rounded-full bg-[#6B7A72]" aria-hidden="true" />
      )}
      {status === 'saved' && (
        <span className="h-1.5 w-1.5 rounded-full bg-[#1B3A2D]" aria-hidden="true" />
      )}
      {status === 'error' && (
        <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden="true" />
      )}
      {COPY[status]}
    </span>
  );
}
