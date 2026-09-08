'use client';

/**
 * Several two-pole lines, with her marks already on them, read back to her
 * as one picture.
 *
 * SHARED, NOT OWNED BY ONE TEMPLATE. It is the read-only counterpart of
 * PoleSlider: the same line, the same two words at its ends, the same mark,
 * with nothing to move. A template that asked her to place herself more
 * than once wants to show her all of it at the end, and a coach reading the
 * same sitting wants the same picture in words.
 *
 * IT SHOWS HER POSITIONS AND NOTHING ELSE. There is no scoring here, no
 * ranking, no ordering by anything but the order she was asked, no total,
 * no average of the lines and no adjective. No line is drawn as better or
 * worse than another, no region of any line is coloured as good, and
 * nothing here reads meaning into where a mark is. Each line carries the
 * question it answers, in the words she was actually asked, and her
 * position in HER words rather than as a number, from
 * hddPolePositionInWords, which is the same function the live slider's
 * readout and the coach's card both read. So a member and her coach can
 * never be looking at two different sentences about one mark.
 *
 * A LINE SHE NEVER PLACED SAYS SO. It is drawn with no mark and its caption
 * is the caller's own words for that, rather than a mark quietly sitting at
 * the middle, which would be this component inventing a decision she did
 * not make.
 *
 * NOTHING HERE IS A CONTROL. It renders no button and no input, so a
 * closing screen and a coach's card are not full of things that do nothing.
 * The drawn line is aria-hidden and the sentence beside it is what a screen
 * reader reads.
 *
 * NO MOTION OF ITS OWN. The mark is simply where she put it: there is
 * nothing to travel, because nothing here ever changes after it is drawn.
 * Whatever fade it arrives with belongs to the screen it is on, which is
 * how it stays correct under reduced motion without a branch.
 */

import { hddPolePositionInWords } from '@/lib/happiness-deep-dive/interactive';

/** One line she was asked to stand on, and where she stood. */
export type PoleMapLine = {
  /** Stable within one map. Only used as a key. */
  key: string;
  /** The question this line answered, in the words she was asked. */
  label: string;
  poles: { near: string; far: string };
  /** 0 is the near pole, 100 the far one. Null when she never placed a mark. */
  value: number | null;
};

export function PoleMap({
  lines,
  heading,
  label,
  unsetLabel,
}: {
  lines: PoleMapLine[];
  /** A small caption above the picture. Names what it is and does nothing else. */
  heading?: string | undefined;
  /** The accessible name of the whole picture. */
  label: string;
  /** What a line she never placed says instead of a position. */
  unsetLabel: string;
}) {
  return (
    <section aria-label={label}>
      {heading && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
          {heading}
        </p>
      )}

      <ul className={`space-y-6 ${heading ? 'mt-5' : ''}`}>
        {lines.map((line) => {
          const words =
            line.value === null ? unsetLabel : hddPolePositionInWords(line.value, line.poles);
          const position = line.value ?? 50;
          return (
            <li key={line.key}>
              <p className="font-[family-name:var(--font-cormorant-garamond)] text-[19px] leading-snug text-[#F5F0E4]">
                {line.label}
              </p>

              <div className="mt-3 flex items-end justify-between gap-4">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-[#F5F0E4]/55">
                  {line.poles.near}
                </span>
                <span className="text-right text-[12px] font-semibold uppercase tracking-wider text-[#F5F0E4]/55">
                  {line.poles.far}
                </span>
              </div>

              {/* The drawn line. Decorative: the sentence beneath it is what is read. */}
              <div aria-hidden="true" className="relative mt-2.5 h-5">
                <span className="absolute inset-x-0 top-1/2 block h-px -translate-y-1/2 rounded-full bg-[#F5F0E4]/25" />
                {line.value !== null && (
                  <>
                    <span
                      className="absolute top-1/2 block h-px -translate-y-1/2 rounded-full bg-[#C4A050]"
                      style={{ left: 0, width: `${position}%` }}
                    />
                    <span
                      className="absolute top-1/2 block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#C4A050] bg-[#1B3A2D] shadow-[0_0_0_5px_rgba(196,160,80,0.16)]"
                      style={{ left: `${position}%` }}
                    />
                  </>
                )}
              </div>

              <p
                className={`mt-1.5 text-[15px] leading-relaxed ${
                  line.value === null ? 'text-[#F5F0E4]/50' : 'text-[#C4A050]'
                }`}
              >
                {words}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
