'use client';

/**
 * "The new/worsening concern control reaches a human being — make it
 * feel like it. Show the coach's avatar beside it and phrase it as
 * sending, not flagging." Same initials-circle avatar convention
 * AvatarLink.tsx already uses (this app has no photo avatars anywhere).
 */

export function ConcernToCoach({
  coachFirstName,
  checked,
  onChange,
}: {
  /** Null when no coach is assigned yet — copy degrades to "your coach" rather than inventing a name. */
  coachFirstName: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const coachLabel = coachFirstName ?? 'your coach';

  return (
    <label
      className={`mef-press flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all duration-200 ease-out ${
        checked ? 'border-[#1B3A2D]/25 bg-[#1B3A2D]/[0.04]' : 'border-[#1B3A2D]/10 bg-white'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D] text-sm font-semibold text-white">
        {coachLabel.charAt(0).toUpperCase()}
      </span>
      <span className="flex-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <span className="block text-sm font-medium text-[#1B3A2D]">
          Send {coachLabel} a note about something new or worsening
        </span>
        <span className="mt-0.5 block text-[12px] text-[#6B7A72]">
          {checked ? `Sending to ${coachLabel} when you save.` : 'Only sent if you check this.'}
        </span>
      </span>
    </label>
  );
}
