import type { ReactNode } from 'react';
import { RootedResetLockup } from '@/components/brand/RootedResetLockup';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] px-5 py-12 font-[family-name:var(--font-dm-sans)]">
      {/* NO BOT-CHECK PRELOAD HERE, and that is the point. It used to sit
          in this layout, which meant /login downloaded 60 kB of Cloudflare
          on a screen that no longer has a widget on it. The preload moved
          down into the three screens that still carry one (signup, verify,
          reset-password), so signing in fetches nothing from a third party
          at all. See lib/turnstile/verify.ts. */}
      <main className="w-full max-w-sm">
        {/* Was this exact markup inline. Extracted so the public entry
            experience shows the same lockup rather than a third copy of
            it; this renders byte for byte as it did. */}
        <RootedResetLockup className="mb-6" />

        <div className="rounded-[28px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
          {children}
        </div>
      </main>
    </div>
  );
}
