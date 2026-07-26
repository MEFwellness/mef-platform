'use client';

/**
 * Home dashboard redesign — "What Root Is Noticing" carousel. Shared
 * image-backed vertical card shell for all four cards in the zone
 * (What We're Noticing, Your Root Map, From Root, Recommended For You).
 * Roughly 3:4, image filling the card, a dark gradient anchoring a
 * kicker + short headline in the lower portion.
 *
 * Two tap behaviors, matching what each card's original action was:
 *  - `href` — navigates to the card's existing destination page
 *    (Your Root Map -> /root-map, Recommended For You -> /recommendations).
 *  - `sheetTitle` (+ `children`) — the card had no dedicated destination
 *    page before (What We're Noticing, From Root were dashboard-only,
 *    one of them previously an inline "Tell me more" expand); tapping
 *    opens a bottom sheet with the full original content instead, via
 *    NoticingSheet.tsx. Rendered as a sibling of this tile, never nested
 *    inside it, and this tile itself uses no backdrop-filter/transform —
 *    see the avatar/profile-menu clipping regression this redesign
 *    already hit once from exactly that combination.
 */

import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, type ReactNode } from 'react';
import { NoticingSheet } from './NoticingSheet';

const TILE_SHELL =
  'mef-press relative block aspect-[3/4] w-[172px] shrink-0 snap-start overflow-hidden rounded-[24px] text-left';

function TileFace({ imageSrc, kicker, headline }: { imageSrc: string; kicker: string; headline: string }) {
  return (
    <>
      <Image
        src={imageSrc}
        alt=""
        fill
        sizes="172px"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#F5B700]">{kicker}</p>
        <p className="mt-1 font-[family-name:var(--font-cormorant-garamond)] text-lg leading-snug text-[#FAFAF8]">
          {headline}
        </p>
      </div>
    </>
  );
}

export function NoticingTile({
  imageSrc,
  kicker,
  headline,
  href,
  sheetTitle,
  children,
}: {
  imageSrc: string;
  kicker: string;
  headline: string;
  href?: Route;
  sheetTitle?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (href) {
    return (
      <Link
        href={href}
        className={`${TILE_SHELL} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]`}
      >
        <TileFace imageSrc={imageSrc} kicker={kicker} headline={headline} />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`${TILE_SHELL} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]`}
      >
        <TileFace imageSrc={imageSrc} kicker={kicker} headline={headline} />
      </button>
      <NoticingSheet title={sheetTitle ?? kicker} open={open} onClose={() => setOpen(false)}>
        {children}
      </NoticingSheet>
    </>
  );
}
