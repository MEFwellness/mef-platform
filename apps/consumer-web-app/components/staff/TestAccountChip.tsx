/**
 * ONE CHIP, EVERY STAFF SURFACE.
 *
 * `/admin` grew this label first (2026-08-29), so a fixture that IS shown
 * in a list is never mistaken for a member. The coach platform needs the
 * identical mark for the identical reason, and two copies of a label is
 * how two labels end up disagreeing about what they mean, so the admin
 * screen imports this one now rather than keeping its own.
 *
 * Presentational only: no data access, no server imports, so a client
 * component (`ClientListPanel`, `MemberPickerPanel`, `AdminPanel`) and a
 * server component can both render it from the same file.
 */
export function TestAccountChip({ className = '' }: { className?: string }) {
  return (
    <span
      className={`rounded-full bg-[#F3F6F4] px-2 py-0.5 text-[11px] font-medium text-[#6B7A72] ${className}`.trim()}
    >
      Test account
    </span>
  );
}
