/**
 * Blueprint Library — every named program MEF has authored, with its
 * status, its version and what it costs a member to do.
 *
 * Reached from /admin. Read by any staff account (RLS: staff read, admin
 * write), but every action on the detail screen is administrator only,
 * because a blueprint is MEF's content and not a coach's.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronRight, Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { listBlueprintLibraryAction } from '@/app/actions/program-blueprints';
import { BLUEPRINT_STATUS_TONE, BLUEPRINT_STATUS_LABEL } from '@/components/blueprints/statusTone';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export const dynamic = 'force-dynamic';

export default async function BlueprintLibraryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');

  const rows = await listBlueprintLibraryAction();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/admin" label="Admin" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Layers className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Blueprint Library</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Named Programs
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Programs MEF has authored once and can give to many members. A draft is not assignable
            by anyone. Approving one is what makes it assignable, and only you can do that.
          </p>
        </div>

        <div className="mt-7 space-y-3">
          {rows.length === 0 && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">No named programs have been authored yet.</p>
            </div>
          )}

          {rows.map((row) => (
            <Link
              key={row.programId}
              href={
                (row.latestVersionId
                  ? `/admin/blueprints/${row.latestVersionId}`
                  : '/admin/blueprints') as Route
              }
              className={`${CARD} mef-focus-ring block p-6 transition hover:bg-[#FAFAF8]`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-medium text-[#1B3A2D]">{row.displayName}</p>
                    {row.status && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${BLUEPRINT_STATUS_TONE[row.status]}`}
                      >
                        {BLUEPRINT_STATUS_LABEL[row.status]}
                      </span>
                    )}
                    {row.latestVersionNumber !== null && (
                      <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-[#1B3A2D]">
                        v{row.latestVersionNumber}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-sm text-[#6B7A72]">
                    {[
                      row.durationWeeks ? `${row.durationWeeks} weeks` : null,
                      row.sessionsPerWeek ? `${row.sessionsPerWeek} sessions a week` : null,
                      row.equipmentMode,
                      row.periodization,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>

                  {row.versions.length > 1 && (
                    <p className="mt-1 text-xs text-[#9AA79F]">
                      {row.versions.length} versions, all readable
                    </p>
                  )}
                </div>
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#9AA79F]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
