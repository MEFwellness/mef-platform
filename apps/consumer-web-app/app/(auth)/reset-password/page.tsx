import { ResetPasswordForm } from './ResetPasswordForm';
import { TurnstilePreload } from '@/components/auth/TurnstilePreload';

/**
 * Server wrapper so `?reason=expired` can be read without pulling
 * useSearchParams (and the Suspense boundary it requires) into the form.
 * app/api/auth/recovery/route.ts sends every dead link here with that flag,
 * which is what turns "your link did not work" from a generic login error
 * into an honest explanation with the fix attached.
 */
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  return (
    <>
      {/* Asking for a reset link sends mail to whatever address is typed,
          so this screen keeps its bot check and therefore keeps the head
          start that check needs. It sat in app/(auth)/layout.tsx until
          /login stopped carrying a widget. */}
      <TurnstilePreload />
      <ResetPasswordForm expiredLink={searchParams?.reason === 'expired'} />
    </>
  );
}
