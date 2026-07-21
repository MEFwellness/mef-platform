import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { getProgramTemplateWithContentAction } from '@/app/actions/coach-programs';
import { ProgramBuilder } from '@/components/coach-program-builder/ProgramBuilder';

export default async function ProgramBuilderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { forClient?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  // coach_all_own_program_templates RLS (migration 82) is what actually
  // restricts this to the signed-in coach's own template — a template
  // owned by another coach simply comes back as null here, same clean
  // 404 as every other coach-scoped detail page in this app.
  const template = await getProgramTemplateWithContentAction(params.id);
  if (!template) notFound();

  const backHref = searchParams.forClient
    ? `/coach/clients/${searchParams.forClient}/programs`
    : '/coach/programs';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-40 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref={backHref as Route} label="Back" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Program Builder</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {template.name}
          </h1>
        </div>

        <div className="mt-7">
          <ProgramBuilder
            templateId={template.id}
            initialTemplate={template}
            clientId={searchParams.forClient}
            backHref={backHref}
          />
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
