/**
 * The abstract motion cue one section opens with.
 *
 * IT IS KEYED BY CONTENT. Each section's row carries a `motion_cue` key
 * and this renders the drawing for it, so a coach can move a cue from one
 * section to another with no deploy. A key this file does not know renders
 * the still default rather than nothing, so a typo costs a section its
 * animation and not its screen.
 *
 * ABSTRACT, NEVER LITERAL. No chakra colour, no anatomy, no organ. Two
 * inks only, the warm gold and the cream already on the panel, at low
 * opacity. What varies between the nine is the SHAPE OF THE MOVEMENT: soft
 * organic shapes, a slow circular pulse, a flowing line, connected dots, a
 * downward clearing flow, a line that begins tight and opens, a sunrise to
 * evening arc, a balanced wave, and a pulse that settles into a steady
 * rhythm.
 *
 * DECORATIVE, AND MARKED AS SUCH. aria-hidden on the whole drawing: it
 * says nothing a screen reader needs, and the words beside it say
 * everything.
 *
 * REDUCED MOTION IS HANDLED IN CSS, not here, so the finished state is the
 * natural one and the drawing is complete rather than absent.
 */

const GOLD = '#C4A050';
const CREAM = '#F5F0E4';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 240 96"
      className="h-20 w-full"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {children}
    </svg>
  );
}

export function SectionMotion({ cue }: { cue: string }) {
  switch (cue) {
    case 'organic_shapes':
      return (
        <Frame>
          <g className="mef-wbs-cue-drift" style={{ transformOrigin: '120px 48px' }}>
            <ellipse cx="88" cy="48" rx="42" ry="26" fill={GOLD} opacity="0.18" />
            <ellipse cx="140" cy="44" rx="34" ry="22" fill={CREAM} opacity="0.12" />
            <ellipse cx="118" cy="58" rx="26" ry="16" fill={GOLD} opacity="0.12" />
          </g>
        </Frame>
      );

    case 'circular_pulse':
      return (
        <Frame>
          <g style={{ transformOrigin: '120px 48px' }}>
            <circle cx="120" cy="48" r="28" fill="none" stroke={CREAM} strokeWidth="1" opacity="0.22" />
            <circle
              cx="120"
              cy="48"
              r="28"
              fill="none"
              stroke={GOLD}
              strokeWidth="1.5"
              className="mef-wbs-cue-ring"
              style={{ transformOrigin: '120px 48px' }}
            />
          </g>
        </Frame>
      );

    case 'flowing_line':
      return (
        <Frame>
          <path
            d="M8 62 C 48 20, 88 84, 128 46 S 200 26, 232 54"
            fill="none"
            stroke={GOLD}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.7"
            className="mef-wbs-cue-draw"
            style={{ ['--mef-wbs-dash' as string]: '320' }}
          />
        </Frame>
      );

    case 'connected_dots':
      return (
        <Frame>
          <polyline
            points="30,62 72,38 114,58 156,34 198,52"
            fill="none"
            stroke={CREAM}
            strokeWidth="1"
            opacity="0.3"
            className="mef-wbs-cue-draw"
            style={{ ['--mef-wbs-dash' as string]: '220' }}
          />
          {[
            [30, 62],
            [72, 38],
            [114, 58],
            [156, 34],
            [198, 52],
          ].map(([x, y], index) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="3.5"
              fill={GOLD}
              opacity="0.8"
              className="mef-wbs-cue-dot"
              style={{ animationDelay: `${index * 140}ms`, transformOrigin: `${x}px ${y}px` }}
            />
          ))}
        </Frame>
      );

    case 'clearing_flow':
      return (
        <Frame>
          {[60, 100, 140, 180].map((x, index) => (
            <rect
              key={x}
              x={x}
              y="26"
              width="1.6"
              height="44"
              rx="0.8"
              fill={GOLD}
              opacity="0.55"
              className="mef-wbs-cue-fall"
              style={{ animationDelay: `${index * 320}ms` }}
            />
          ))}
        </Frame>
      );

    case 'opening_line':
      return (
        <Frame>
          <g className="mef-wbs-cue-open" style={{ transformOrigin: '20px 48px' }}>
            <rect x="20" y="47" width="200" height="1.6" rx="0.8" fill={GOLD} opacity="0.75" />
            <rect x="20" y="38" width="200" height="1" rx="0.5" fill={CREAM} opacity="0.2" />
            <rect x="20" y="57" width="200" height="1" rx="0.5" fill={CREAM} opacity="0.2" />
          </g>
        </Frame>
      );

    case 'sunrise_arc':
      return (
        <Frame>
          <path
            d="M20 74 A 100 100 0 0 1 220 74"
            fill="none"
            stroke={GOLD}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.75"
            className="mef-wbs-cue-draw"
            style={{ ['--mef-wbs-dash' as string]: '330' }}
          />
          <rect x="20" y="73.2" width="200" height="1" rx="0.5" fill={CREAM} opacity="0.2" />
        </Frame>
      );

    case 'balanced_wave':
      return (
        <Frame>
          <path
            d="M12 48 C 44 18, 76 78, 108 48 S 172 18, 204 48 S 226 60, 228 48"
            fill="none"
            stroke={GOLD}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.7"
            className="mef-wbs-cue-draw"
            style={{ ['--mef-wbs-dash' as string]: '340' }}
          />
          <rect x="12" y="47.5" width="216" height="1" rx="0.5" fill={CREAM} opacity="0.18" />
        </Frame>
      );

    case 'settling_pulse':
      return (
        <Frame>
          {[0, 1, 2, 3, 4].map((index) => (
            <rect
              key={index}
              x={64 + index * 28}
              y="30"
              width="2"
              height="36"
              rx="1"
              fill={GOLD}
              opacity={0.4 + index * 0.1}
              className="mef-wbs-cue-settle"
              style={{ animationDelay: `${index * 180}ms` }}
            />
          ))}
        </Frame>
      );

    default:
      return (
        <Frame>
          <rect x="20" y="47" width="200" height="1.6" rx="0.8" fill={GOLD} opacity="0.5" />
        </Frame>
      );
  }
}
