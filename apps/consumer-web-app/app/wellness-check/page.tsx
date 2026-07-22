import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GuestPreviewFlow } from './GuestPreviewFlow';

/**
 * Public entry point for the pre-signup Quick Wellness Check — reached
 * from marketing/campaign links (landing page, ads, QR codes, email), not
 * from the default login route. A visitor who already has a valid session
 * (an existing member clicking a campaign link, or a guest who just
 * finished signing up) is sent straight into the app's normal routing
 * (app/page.tsx) instead of seeing the guest preview again.
 */
export default async function WellnessCheckPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/');

  return <GuestPreviewFlow />;
}
