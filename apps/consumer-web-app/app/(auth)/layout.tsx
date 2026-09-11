import type { ReactNode } from 'react';
import { RootedResetLockup } from '@/components/brand/RootedResetLockup';
import { TurnstilePreload } from '@/components/auth/TurnstilePreload';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] px-5 py-12 font-[family-name:var(--font-dm-sans)]">
      {/* The bot check's script starts downloading while this page is
          still being parsed, instead of after the app has hydrated. Every
          screen under this layout carries a widget, and the two seconds
          that used to be spent before the challenge could even begin were
          two seconds of the member's submit budget. See
          components/auth/TurnstilePreload.tsx for the measurement. */}
      <TurnstilePreload />

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
