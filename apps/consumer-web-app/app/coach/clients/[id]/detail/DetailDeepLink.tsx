'use client';

import { useEffect } from 'react';
import { requestDetailSection } from '@/lib/coach-detail/detailBus';
import { sectionIdForAnchor } from '@/lib/coach-detail/sections';

/**
 * Keeps the two existing deep links into this page working now that their
 * targets start folded.
 *
 * `/coach/clients/[id]/detail#member-visibility` is the coach brief's
 * "What her app contains" card, and `#case-view` is linked from the
 * entries page. Both point at an anchor that this build moved inside a
 * collapsible section, and a browser asked to jump to an id that renders
 * nothing does nothing and reports nothing. So the hash is resolved to its
 * owning section, that section is asked to open, and the section performs
 * the scroll once its contents actually exist.
 *
 * Renders nothing, writes nothing, and runs from a mounted effect rather
 * than during render.
 */
export function DetailDeepLink() {
  useEffect(() => {
    function follow() {
      const anchorId = window.location.hash.replace(/^#/, '');
      if (anchorId.length === 0) return;
      const sectionId = sectionIdForAnchor(anchorId);
      if (!sectionId) return;
      requestDetailSection({ sectionId, anchorId });
    }
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  return null;
}
