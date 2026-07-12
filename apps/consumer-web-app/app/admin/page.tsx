import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listUsers, listActiveCoachUserIds, listAssignmentHistory } from '@/app/actions/admin';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AdminPanel } from './AdminPanel';

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  const [users, coachIds, assignments] = await Promise.all([
    listUsers(),
    listActiveCoachUserIds(),
    listAssignmentHistory(),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Admin
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          User management, coach roles, and client assignments.
        </p>

        <AdminPanel users={users} coachIds={coachIds} assignments={assignments} />
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
