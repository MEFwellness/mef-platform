'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  searchDetailPage,
  ASSIGN_SECTION_ID,
  type DetailPageSearchResult,
} from '@/lib/coach-detail/sections';
import {
  filterAssignableTemplates,
  type AssignableTemplate,
} from '@/lib/assignments/assignableCatalog';
import { assessmentRowElementId } from '@/lib/coach-detail/assessmentStatus';
import { requestAssessmentRowFocus, requestDetailSection } from '@/lib/coach-detail/detailBus';

/**
 * One field at the top of the client detail page, over two different
 * things.
 *
 * WHAT IT SEARCHES, AND WHY BOTH. A coach arriving at this page is either
 * looking for something already on it ("where is the check-in history")
 * or looking for something to send ("has she done the joy one"). Those
 * were two different journeys through the same page, one of them a scroll
 * and the other a scroll followed by typing into a second field. Both are
 * now the first thing on the screen.
 *
 * THE MATCHING IS THE ASSIGN PANEL'S OWN. Both groups below run through
 * lib/assignments/assignableCatalog.ts's textMatchesSearch, the function
 * that field already used, so "case insensitive, partial" means the same
 * thing in both places by construction rather than by two implementations
 * agreeing today.
 *
 * WHAT IT DOES NOT DO. It does not assign anything. Choosing a
 * questionnaire here opens Assessments and Findings, scrolls to that
 * questionnaire's own row in the Assessment Status block and marks it, so
 * a coach arrives looking at the row that answers her question, in
 * whichever of the three groups it is actually in. The send is still the
 * one button on that row, so there is still one way to send a thing.
 *
 * IT POINTS AT A ROW, NOT AT A FILTER (2026-09-08). It used to pre-fill a
 * search field inside the old Assign panel. That panel is gone: the rows
 * are grouped by status now, and hiding the other eighteen would have hidden
 * the grouping that is the whole point of the block.
 */

const EMPTY_LINE = 'Nothing on this page matches that.';

type Props = {
  /** The identical list the Assign panel is handed, so the two fields can never know different questionnaires. */
  assignableTemplates: AssignableTemplate[];
};

export function DetailPageSearch({ assignableTemplates }: Props) {
  const fieldId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const pageResults = useMemo(() => searchDetailPage(query), [query]);
  const templateResults = useMemo(
    () => (query.trim().length === 0 ? [] : filterAssignableTemplates(assignableTemplates, query)),
    [assignableTemplates, query]
  );

  const hasQuery = query.trim().length > 0;
  const showDropdown = open && hasQuery;

  // A tap anywhere else closes the list. Pointerdown rather than click, so
  // the list is gone before the tap lands on whatever was underneath it.
  useEffect(() => {
    if (!showDropdown) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showDropdown]);

  function goToPageResult(result: DetailPageSearchResult) {
    setOpen(false);
    requestDetailSection({ sectionId: result.sectionId, anchorId: result.anchorId });
  }

  function goToTemplate(template: AssignableTemplate) {
    setOpen(false);
    /*
      TWO REQUESTS, AND THEY ARE DIFFERENT JOBS. The section is asked to
      open and scroll to this row's own DOM id, which it already knows to
      do only once its contents exist. The block is asked to MARK that
      row, so a coach landing in the middle of a list of nineteen can see
      which one she chose. Neither one is mounted at this instant, which is
      exactly what the bus holds an unclaimed request for.
    */
    requestAssessmentRowFocus(template.id);
    requestDetailSection({
      sectionId: ASSIGN_SECTION_ID,
      anchorId: assessmentRowElementId(template.id),
    });
  }

  return (
    <div
      ref={containerRef}
      data-detail-page-search="true"
      /* Pinned: it stays on screen while the page scrolls, because the
         whole point is that a coach never has to scroll to find a way to
         stop scrolling. */
      className="sticky top-0 z-30 -mx-5 mb-4 bg-gradient-to-b from-[#EFF6F1] via-[#EFF6F1] to-[#EFF6F1]/95 px-5 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-10 md:px-10"
    >
      <label htmlFor={fieldId} className="sr-only">
        Search this page and the questionnaire library
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          id={fieldId}
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search this page or a questionnaire"
          className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-white py-3 pl-11 pr-4 text-base text-[#1B3A2D] shadow-[0_2px_16px_-6px_rgba(27,58,45,0.18)] placeholder:text-[#6B7A72] focus:border-[#F5B700] focus:outline-none sm:text-sm"
        />
      </div>

      {showDropdown && (
        <div
          role="group"
          aria-label="Search results"
          className="absolute left-5 right-5 z-40 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-[#1B3A2D]/10 bg-white shadow-[0_12px_32px_-12px_rgba(27,58,45,0.35)] sm:left-6 sm:right-6 md:left-10 md:right-10"
        >
          {pageResults.length === 0 && templateResults.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[#6B7A72]">{EMPTY_LINE}</p>
          ) : (
            <>
              {pageResults.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
                    On this page
                  </p>
                  <ul className="divide-y divide-[#1B3A2D]/5">
                    {pageResults.map((result) => (
                      <li key={`${result.sectionId}-${result.anchorId}`}>
                        <button
                          type="button"
                          onClick={() => goToPageResult(result)}
                          className="block w-full px-4 py-3 text-left transition hover:bg-[#1B3A2D]/[0.03]"
                        >
                          <span className="block text-sm font-medium text-[#1B3A2D]">
                            {result.label}
                          </span>
                          {result.kind === 'card' && (
                            <span className="mt-0.5 block text-xs text-[#6B7A72]">
                              in {result.sectionTitle}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {templateResults.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
                    Questionnaires
                  </p>
                  <ul className="divide-y divide-[#1B3A2D]/5">
                    {templateResults.map((template) => (
                      <li key={template.id}>
                        <button
                          type="button"
                          data-questionnaire-result={template.id}
                          onClick={() => goToTemplate(template)}
                          className="block w-full px-4 py-3 text-left transition hover:bg-[#1B3A2D]/[0.03]"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-[#1B3A2D]">
                              {template.displayName}
                            </span>
                            <span className="shrink-0 rounded-full bg-[#1B3A2D]/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#4F645A]">
                              {template.areaLabel}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-[#6B7A72]">
                            Opens its row in Assessment Status
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
