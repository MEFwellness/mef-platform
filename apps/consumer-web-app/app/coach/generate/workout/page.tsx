import { redirect } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { listDistinctCatalogValues } from '@/lib/your-move/catalog';
import { GenerateWorkoutFlow } from '@/components/your-move-generation/GenerateWorkoutFlow';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function GenerateWorkoutPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const [muscleOptions, equipmentOptions, difficultyOptions] = await Promise.all([
    listDistinctCatalogValues(supabase, 'primary_muscle'),
    listDistinctCatalogValues(supabase, 'equipment'),
    listDistinctCatalogValues(supabase, 'difficulty'),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/coach/generate" label="Generate" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Generate a Workout</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Generate a Workout
          </h1>
        </div>

        <div className="mt-7">
          <GenerateWorkoutFlow
            muscleOptions={muscleOptions}
            equipmentOptions={equipmentOptions}
            difficultyOptions={difficultyOptions}
          />
        </div>
      </main>

    </div>
  );
}
