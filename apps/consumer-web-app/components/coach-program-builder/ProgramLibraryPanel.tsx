'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Star, Copy, Archive, ArchiveRestore, Trash2, Search, Plus } from 'lucide-react';
import type { CoachProgramTemplate, ProgramTemplateStatus } from '@mef/shared-types-contracts';
import {
  toggleProgramTemplateFavoriteAction,
  duplicateProgramTemplateAction,
  setProgramTemplateStatusAction,
  deleteProgramTemplateAction,
} from '@/app/actions/coach-programs';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const STATUS_TABS: { value: ProgramTemplateStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export function ProgramLibraryPanel({
  initialTemplates,
  newTemplateHref,
}: {
  initialTemplates: CoachProgramTemplate[];
  newTemplateHref: string;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [statusFilter, setStatusFilter] = useState<ProgramTemplateStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [favoritedOnly, setFavoritedOnly] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = templates.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (favoritedOnly && !t.is_favorited) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function optimisticUpdate(id: string, patch: Partial<CoachProgramTemplate>) {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function handleToggleFavorite(template: CoachProgramTemplate) {
    optimisticUpdate(template.id, { is_favorited: !template.is_favorited });
    startTransition(() => {
      toggleProgramTemplateFavoriteAction(template.id, !template.is_favorited);
    });
  }

  function handleArchiveToggle(template: CoachProgramTemplate) {
    const nextStatus: ProgramTemplateStatus =
      template.status === 'archived' ? 'active' : 'archived';
    optimisticUpdate(template.id, { status: nextStatus });
    startTransition(() => {
      setProgramTemplateStatusAction(template.id, nextStatus);
    });
  }

  function handleDuplicate(template: CoachProgramTemplate) {
    startTransition(async () => {
      const result = await duplicateProgramTemplateAction(template.id);
      if ('id' in result) router.push(`/coach/programs/${result.id}` as Route);
    });
  }

  function handleDelete(template: CoachProgramTemplate) {
    if (!window.confirm(`Delete "${template.name}"? This can't be undone.`)) return;
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    startTransition(() => {
      deleteProgramTemplateAction(template.id);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 min-w-[12rem] items-center gap-2 rounded-2xl border border-[#1B3A2D]/10 bg-white px-4 py-2.5">
          <Search className="h-4 w-4 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search programs…"
            className="flex-1 bg-transparent text-sm text-[#1B3A2D] focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setFavoritedOnly((v) => !v)}
          aria-pressed={favoritedOnly}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition ${
            favoritedOnly
              ? 'border-[#F5B700] bg-[#F5B700]/15 text-[#1B3A2D]'
              : 'border-[#1B3A2D]/15 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/30'
          }`}
        >
          <Star className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          Favorites
        </button>
        <Link
          href={newTemplateHref as Route}
          className="flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          New Program
        </Link>
      </div>

      <div className="mt-3 flex gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              statusFilter === tab.value
                ? 'bg-[#1B3A2D] text-white'
                : 'bg-white text-[#6B7A72] hover:bg-[#1B3A2D]/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={`${CARD} mt-4 p-6`}>
          <p className="text-sm text-[#6B7A72]">
            {templates.length === 0
              ? 'No programs yet — create your first one.'
              : 'No programs match these filters.'}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <div key={template.id} className={`${CARD} flex flex-col p-5`}>
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/coach/programs/${template.id}` as Route}
                  className="min-w-0 flex-1 hover:opacity-80"
                >
                  <p className="truncate text-base font-semibold text-[#1B3A2D]">{template.name}</p>
                </Link>
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(template)}
                  aria-label={template.is_favorited ? 'Unfavorite' : 'Favorite'}
                  className="shrink-0 text-[#F5B700]"
                >
                  <Star
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    fill={template.is_favorited ? '#F5B700' : 'none'}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {template.description && (
                <p className="mt-1 line-clamp-2 text-xs text-[#6B7A72]">{template.description}</p>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                    template.status === 'active'
                      ? 'bg-[#1B3A2D]/[0.08] text-[#1B3A2D]'
                      : template.status === 'archived'
                        ? 'bg-[#6B7A72]/10 text-[#6B7A72]'
                        : 'bg-[#F5B700]/20 text-[#854D0E]'
                  }`}
                >
                  {template.status}
                </span>
                {template.difficulty && (
                  <span className="rounded-full bg-[#EFF6F1] px-2 py-0.5 text-[10px] font-medium text-[#1B3A2D]/70">
                    {DIFFICULTY_LABEL[template.difficulty]}
                  </span>
                )}
                {template.estimated_duration_minutes && (
                  <span className="rounded-full bg-[#EFF6F1] px-2 py-0.5 text-[10px] font-medium text-[#1B3A2D]/70">
                    {template.estimated_duration_minutes} min
                  </span>
                )}
              </div>

              <div className="mt-auto flex items-center gap-1.5 pt-4">
                <button
                  type="button"
                  onClick={() => handleDuplicate(template)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-[#1B3A2D]/5 hover:text-[#1B3A2D]"
                >
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => handleArchiveToggle(template)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-[#1B3A2D]/5 hover:text-[#1B3A2D]"
                >
                  {template.status === 'archived' ? (
                    <>
                      <ArchiveRestore
                        className="h-3.5 w-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Restore
                    </>
                  ) : (
                    <>
                      <Archive className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      Archive
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(template)}
                  className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
