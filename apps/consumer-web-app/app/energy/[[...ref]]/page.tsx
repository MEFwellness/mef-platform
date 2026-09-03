import type { Metadata } from 'next';
import { EnergyEntryClient } from '@/components/public-entry/EnergyEntryClient';
import { ENERGY_EXPERIENCE_TITLE } from '@/lib/public-entry/copy';
import { resolveSourceCode } from '@/lib/public-entry/sources';
import { readAttributionFromQuery } from '@/lib/acquisition/attribution';

/**
 * Where Your Energy Goes: the public entry experience, and the first thing
 * a stranger sees of this brand.
 *
 * TWO LINK SHAPES, ONE PAGE. An optional catch-all so a printed or spoken
 * link can be /energy/dr-okafor while a pasted or shortened one can be
 * /energy?ref=dr-okafor. Both resolve through
 * lib/public-entry/sources.ts's resolveSourceCode, and the path form wins
 * when somebody manages to supply both.
 *
 * THIS RENDER DECIDES NOTHING AND WRITES NOTHING. It reads the code off the
 * URL, hands it to the client, and stops. The session, the arrival event
 * and every later write are made by the browser calling
 * /api/public-entry once it has actually mounted, for the standing reason
 * that a page render must never insert a row: Next prefetches a link the
 * moment it scrolls into view, and a render-time write would count arrivals
 * for people who never arrived.
 *
 * WHAT IT READS OFF THE URL, AND WHAT IT DOES NOT. The source code, the
 * five utm parameters and the three ad click ids, all normalised here so
 * the browser is handed values that are already the shape the database will
 * store. Coarse request geo is deliberately NOT read here: it comes from
 * the headers on the browser's own call to /api/public-entry, where it
 * cannot be forged by a caller and does not depend on this page having
 * remembered to hand it down.
 *
 * A SIGNED-IN VISITOR IS NOT REDIRECTED. Somebody who already has an
 * account may perfectly well open a partner's link, and bouncing them into
 * the app would break the link they were handed. The claim in the root
 * layout only ever binds a member who does not already have an origin row,
 * so nothing about their account changes by looking at this page.
 */

const DESCRIPTION =
  'Nine questions, about two minutes, no account needed. A look at where your energy actually goes, built from your own answers.';

export const metadata: Metadata = {
  title: `${ENERGY_EXPERIENCE_TITLE} | MEF Wellness`,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    title: ENERGY_EXPERIENCE_TITLE,
    description: DESCRIPTION,
    type: 'website',
  },
};

export default function EnergyEntryPage({
  params,
  searchParams,
}: {
  params: { ref?: string[] };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const sourceCode = resolveSourceCode({
    pathSegment: params.ref?.[0] ?? null,
    query: searchParams,
  });

  const attribution = readAttributionFromQuery({
    query: searchParams,
    sourceCode,
    landingPath: params.ref?.[0] ? `/energy/${params.ref[0]}` : '/energy',
  });

  return <EnergyEntryClient sourceCode={sourceCode} attribution={attribution} />;
}
