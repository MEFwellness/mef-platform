import type { Metadata } from 'next';
import { EnergyEntryClient } from '@/components/public-entry/EnergyEntryClient';
import { ENERGY_EXPERIENCE_TITLE } from '@/lib/public-entry/copy';
import { resolveSourceCode } from '@/lib/public-entry/sources';

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

  return <EnergyEntryClient sourceCode={sourceCode} />;
}
