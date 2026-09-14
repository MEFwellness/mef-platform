import type { ReactNode } from 'react';
import { TurnstilePreload } from '@/components/auth/TurnstilePreload';

/**
 * Signup keeps its bot check, so it keeps the preload that gives the check
 * a head start: Cloudflare's script starts downloading while this page is
 * still being parsed rather than after the app hydrates. See
 * components/auth/TurnstilePreload.tsx for the measurement.
 *
 * A layout of its own rather than a tag inside the page because the page is
 * a client component, and this has to be in the server-rendered HTML to be
 * early enough to be worth anything. It moved here out of
 * app/(auth)/layout.tsx when /login stopped carrying a widget.
 */
export default function SignUpLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TurnstilePreload />
      {children}
    </>
  );
}
