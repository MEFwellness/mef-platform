/**
 * One blueprint version, in full: every weekly session, every slot, the
 * dosing, the priority ranks, the locks and what week 3 changes.
 *
 * This is the screen a blueprint is approved on, so it shows everything
 * that gets frozen into a member's copy and nothing that does not.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { getBlueprintDetailAction } from '@/app/actions/program-blueprints';
import { BLUEPRINT_STATUS_LABEL, BLUEPRINT_STATUS_MEANING, BLUEPRINT_STATUS_TONE } from '@/components/blueprints/statusTone';
import { BlueprintSessionList } from '@/components/blueprints/BlueprintSessionList';
import { BlueprintAdminActions } from './BlueprintAdminActions';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export const dynamic = 'force-dynamic';

export default async function BlueprintDetailPage({
  params,
}: {
  params: { versionId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');

  const detail = await getBlueprintDetailAction(params.versionId);
  if (!detail) notFound();

  const { blueprint, equipment, versions } = detail;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref={'/admin/blueprints' as Route} label="Blueprint Library" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Layers className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Blueprint</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {blueprint.program.display_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${BLUEPRINT_STATUS_TONE[blueprint.status]}`}
            >
              {BLUEPRINT_STATUS_LABEL[blueprint.status]}
            </span>
            <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-[#1B3A2D]">
              Version {blueprint.version_number}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#6B7A72]">
            {BLUEPRINT_STATUS_MEANING[blueprint.status]}
          </p>
        </div>

        {/* -------------------------------------------------- */}
        {/* What it is                                          */}
        {/* -------------------------------------------------- */}
        <section className={`${CARD} mt-6 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            What this program is
          </p>

          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Shape
              </dt>
              <dd className="mt-0.5 text-[#1B3A2D]">
                {[
                  blueprint.duration_weeks ? `${blueprint.duration_weeks} weeks` : null,
                  blueprint.sessions_per_week
                    ? `${blueprint.sessions_per_week} sessions a week`
                    : null,
                  blueprint.equipment_mode,
                  blueprint.periodization ? `${blueprint.periodization} progression` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Equipment the slots actually need
              </dt>
              <dd className="mt-0.5 text-[#1B3A2D]">
                {equipment.length > 0 ? equipment.join(', ') : 'Nothing but a floor'}
              </dd>
            </div>

            {blueprint.member_title && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  What a member sees
                </dt>
                <dd className="mt-0.5 text-[#1B3A2D]">{blueprint.member_title}</dd>
                {blueprint.member_description && (
                  <dd className="mt-1 text-[#6B7A72]">{blueprint.member_description}</dd>
                )}
              </div>
            )}

            {blueprint.coach_purpose && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Purpose (coach only)
                </dt>
                <dd className="mt-0.5 text-[#6B7A72]">{blueprint.coach_purpose}</dd>
              </div>
            )}

            {blueprint.intended_population && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Intended for (coach only)
                </dt>
                <dd className="mt-0.5 text-[#6B7A72]">{blueprint.intended_population}</dd>
              </div>
            )}

            {blueprint.cautions && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Cautions (coach only)
                </dt>
                <dd className="mt-0.5 text-[#6B7A72]">{blueprint.cautions}</dd>
              </div>
            )}

            {blueprint.notes && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Version notes
                </dt>
                <dd className="mt-0.5 text-[#6B7A72]">{blueprint.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* -------------------------------------------------- */}
        {/* The sessions                                        */}
        {/* -------------------------------------------------- */}
        <div className="mt-6">
          <BlueprintSessionList slots={blueprint.slots} durationWeeks={blueprint.duration_weeks} />
        </div>

        {/* -------------------------------------------------- */}
        {/* Version history                                     */}
        {/* -------------------------------------------------- */}
        {versions.length > 1 && (
          <section className={`${CARD} mt-6 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              Version history
            </p>
            <p className="mt-1 text-xs text-[#6B7A72]">
              Nothing is ever deleted. An older version is still exactly what somebody was given.
            </p>
            <div className="mt-3 space-y-1.5">
              {versions.map((version) => (
                <Link
                  key={version.id}
                  href={`/admin/blueprints/${version.id}` as Route}
                  className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition ${
                    version.id === blueprint.id
                      ? 'bg-[#EFF6F1]'
                      : 'bg-[#FAFAF8] hover:bg-[#EFF6F1]'
                  }`}
                >
                  <p className="text-sm font-medium text-[#1B3A2D]">{version.displayName}</p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${BLUEPRINT_STATUS_TONE[version.status]}`}
                  >
                    {BLUEPRINT_STATUS_LABEL[version.status]}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <BlueprintAdminActions
          versionId={blueprint.id}
          programName={blueprint.program.display_name}
          status={blueprint.status}
          versionNumber={blueprint.version_number}
          unfilledSlots={blueprint.slots.filter((slot) => !slot.external_id).length}
          initial={{
            displayName: blueprint.display_name,
            memberTitle: blueprint.member_title ?? '',
            memberDescription: blueprint.member_description ?? '',
            coachPurpose: blueprint.coach_purpose ?? '',
            intendedPopulation: blueprint.intended_population ?? '',
            cautions: blueprint.cautions ?? '',
            notes: blueprint.notes ?? '',
            durationWeeks: String(blueprint.duration_weeks ?? ''),
            sessionsPerWeek: String(blueprint.sessions_per_week ?? ''),
            equipmentMode: blueprint.equipment_mode ?? 'home',
            periodization: blueprint.periodization ?? '',
          }}
        />
      </main>
    </div>
  );
}
