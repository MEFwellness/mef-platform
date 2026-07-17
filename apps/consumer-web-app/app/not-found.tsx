import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] px-5 font-[family-name:var(--font-dm-sans)]">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-7 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Page not found
        </h1>
        <p className="mt-3 text-sm text-[#6B7A72]">
          That page doesn&apos;t exist, or it hasn&apos;t been built yet.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
