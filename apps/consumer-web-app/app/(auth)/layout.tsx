import type { ReactNode } from 'react';
import { RootedResetLockup } from '@/components/brand/RootedResetLockup';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] px-5 py-12 font-[family-name:var(--font-dm-sans)]">
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
