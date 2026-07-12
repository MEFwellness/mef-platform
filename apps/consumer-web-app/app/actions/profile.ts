'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  const timezone = String(formData.get('timezone') ?? '').trim();

  if (!displayName) return { error: 'Display name is required.' };
  if (!timezone) return { error: 'Timezone is required.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName, timezone })
    .eq('id', user.id);

  if (error) return { error: error.message };
  return {};
}
