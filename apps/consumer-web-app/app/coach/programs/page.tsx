/**
 * Coach Program Library — a coach's reusable workout Program Templates
 * (migration 82). Create, search, filter, duplicate, archive/restore,
 * favorite, delete. Assigning a program to a specific client happens from
 * that client's own page (/coach/clients/[id]/programs) — see this app's
 * BottomNav-scoped-nav convention: reached from the coach dashboard, not
 * a new nav tab.
 */

import { redirect } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { listMyProgramTemplatesAction } from '@/app/actions/coach-programs';
import { ProgramLibraryPanel } from '@/components/coach-program-builder/ProgramLibraryPanel';

export default async function CoachProgramsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const templates = await listMyProgramTemplatesAction({});

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/coach" label="Coach Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Program Library</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Program Library
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Build reusable workout programs once, assign them to any client.
          </p>
        </div>

        <div className="mt-7">
          <ProgramLibraryPanel initialTemplates={templates} newTemplateHref="/coach/programs/new" />
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
