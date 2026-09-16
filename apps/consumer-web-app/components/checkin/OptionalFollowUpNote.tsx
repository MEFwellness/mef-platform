'use client';

/**
 * THE ONE OPTIONAL BOX, and the only one.
 *
 * WHAT IT IS FOR. The check-in asks two questions a member can only answer
 * with a tap. She says yes to "something new or worsening" and the app
 * learns a concern exists but not what it is; she says yes to discomfort,
 * picks a spot off a picture and a number off a scale, and never gets to
 * say what it actually feels like. This is the sentence she was missing.
 *
 * WHY IT IS A SHARED COMPONENT RATHER THAN TWO BOXES. The rule is one
 * short optional box per item, never required, and no change to any
 * scoring. A rule kept in one component is kept; a rule copied into every
 * item that wants a box is a rule until somebody copies it wrong. Both
 * places that ask for one get this, with their own label.
 *
 * IT APPEARS ONLY AFTER THE ANSWER THAT MAKES IT RELEVANT. The caller does
 * not render it at all until she has said yes, and clears its value when
 * she goes back to no, so a member who answers no submits exactly what she
 * submitted before this existed.
 */

export function OptionalFollowUpNote({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  /** Short, in her language, and it says optional out loud. */
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mef-animate-in">
      <label className="text-[13px] leading-relaxed text-[#6B7A72]" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none"
      />
    </div>
  );
}
