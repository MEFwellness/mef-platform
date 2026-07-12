import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] px-5 py-12 font-[family-name:var(--font-dm-sans)]">
      <main className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <img
            src="/images/rooted-reset-logo.png"
            alt="Rooted Reset"
            style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '8px' }}
          />
          <div className="leading-tight">
            <span className="block font-[family-name:var(--font-cormorant-garamond)] text-lg tracking-wide text-[#1B3A2D]">
              Rooted Reset
            </span>
            <span className="block text-[11px] font-medium uppercase tracking-wider text-[#6B7A72]">
              by MEF Wellness
            </span>
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
          {children}
        </div>
      </main>
    </div>
  );
}
