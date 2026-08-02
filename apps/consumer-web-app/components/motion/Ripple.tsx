/**
 * Root Motion System — generic Ripple primitive (Bible §3 "Ripple").
 * Not a new implementation: components/checkin/scales/shared.tsx's
 * `TapBleedTile` already is this — a generic tap-origin bleed-fill
 * button (captures the pointer's own coordinates into `--bleed-origin`,
 * then `.mef-bleed-fill`/`.mef-bleed-active` in app/globals.css grow a
 * clip-path circle from that exact point), not check-in-specific
 * despite where the file lives. Re-exported here under the Root Motion
 * System's own namespace rather than building a second implementation
 * of the same mechanics, per CLAUDE.md's "reuse existing systems, don't
 * duplicate working code" rule.
 */

export { TapBleedTile as Ripple } from '@/components/checkin/scales/shared';
