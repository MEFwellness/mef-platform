/**
 * The one progress statement a taker shows, and the thin line under it.
 *
 * ONE NUMBER, ONE WINDOW, NAMED BESIDE IT. The counter and the line
 * always describe the same thing: the line is the counter drawn. A caller
 * that counts within a section says so in `sectionLabel`, and a caller
 * that counts across the whole questionnaire says that instead, so the
 * bar can never be read against a window it did not count.
 *
 * A SCREEN CAN HOLD MORE THAN ONE QUESTION, so `throughNumber` lets the
 * counter name a range ("Questions 4 to 6 of 54") rather than pretending a
 * screen of three is a screen of one. Left off, it reads exactly as it
 * always did.
 *
 * `tone` decides the colour and nothing else. 'forest' is what every
 * caller got before the 2026-09-11 questionnaire pass, so the WBSA taker
 * is unchanged; 'gold' is the Rooted Reset muted gold the questionnaire
 * family now uses, and 'gold-on-forest' is that same line inside the Body
 * Systems Survey's deep forest panel.
 */

type Tone = 'forest' | 'gold' | 'gold-on-forest';

type Props = {
  currentNumber: number;
  /** The last question on this screen, when the screen holds more than one. */
  throughNumber?: number | undefined;
  totalQuestions: number;
  /** Optional: a caller with no section to name simply leaves these off. */
  sectionLabel?: string | undefined;
  sectionIndex?: number | undefined;
  sectionCount?: number | undefined;
  tone?: Tone | undefined;
};

const TONES: Record<Tone, { text: string; track: string; fill: string }> = {
  forest: { text: 'text-[#6B7A72]', track: 'bg-[#EFE9DB]', fill: 'bg-[#1B3A2D]' },
  gold: { text: 'text-[#6B7A72]', track: 'bg-[#1B3A2D]/10', fill: 'bg-[#C4A050]' },
  'gold-on-forest': {
    text: 'text-[#F5F0E4]/60',
    track: 'bg-[#F5F0E4]/12',
    fill: 'bg-[#C4A050]',
  },
};

export function AssessmentProgressBar({
  currentNumber,
  throughNumber,
  totalQuestions,
  sectionLabel,
  sectionIndex,
  sectionCount,
  tone = 'forest',
}: Props) {
  const last = throughNumber && throughNumber > currentNumber ? throughNumber : null;
  const filledTo = last ?? currentNumber;
  const percent = totalQuestions > 0 ? Math.round((filledTo / totalQuestions) * 100) : 0;
  const colors = TONES[tone];
  const hasSection = sectionIndex != null && sectionCount != null;
  const barHeight = tone === 'forest' ? 'h-1.5' : 'h-[3px]';

  return (
    <div>
      {/*
        THE COUNTER NEVER WRAPS, AND THE SECTION NAME GIVES WAY.

        Found in a 390px screenshot: "Questions 33 to 35 of 52" broke across
        two lines with "52" alone on the second, which reads as a mistake.
        The counter is the sentence that has to survive intact, so it is
        nowrap and the section beside it is what truncates.
      */}
      <div className={`flex items-center justify-between gap-3 text-xs font-medium ${colors.text}`}>
        <span className="whitespace-nowrap">
          {last
            ? `Questions ${currentNumber} to ${last} of ${totalQuestions}`
            : `Question ${currentNumber} of ${totalQuestions}`}
        </span>
        {hasSection && (
          <span className="min-w-0 truncate">
            {sectionLabel
              ? `Section ${sectionIndex} of ${sectionCount} · ${sectionLabel}`
              : `Section ${sectionIndex} of ${sectionCount}`}
          </span>
        )}
      </div>
      <div
        className={`mt-2 ${barHeight} w-full overflow-hidden rounded-full ${colors.track}`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Assessment progress"
      >
        <div
          className={`h-full rounded-full ${colors.fill} transition-[width] duration-500 ease-out motion-reduce:transition-none`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
