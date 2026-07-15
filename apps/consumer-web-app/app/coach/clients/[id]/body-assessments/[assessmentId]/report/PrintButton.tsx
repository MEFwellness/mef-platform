'use client';

import { Printer } from 'lucide-react';

/** Browser print-to-PDF is the whole export mechanism (no PDF-generation library) — this button is the only interactive element on an otherwise static, print-friendly page. Hidden entirely when actually printing (print:hidden) since it has no reason to appear on the printed/saved page itself. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden fixed right-6 top-6 flex items-center gap-2 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-medium text-white shadow-lg transition hover:brightness-110"
    >
      <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      Print / Save as PDF
    </button>
  );
}
