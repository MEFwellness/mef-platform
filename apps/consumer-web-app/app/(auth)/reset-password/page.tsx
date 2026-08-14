import { ResetPasswordForm } from './ResetPasswordForm';

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
  return <ResetPasswordForm expiredLink={searchParams?.reason === 'expired'} />;
}
