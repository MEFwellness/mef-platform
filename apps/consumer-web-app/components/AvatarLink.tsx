import Link from 'next/link';

/**
 * The single, consistent Profile/Settings entry point (Premium UX
 * Milestone 1): Profile no longer has a bottom-nav slot, so this avatar —
 * placed at the top-right of every primary screen — is now the only way
 * in. Same markup/classes the Dashboard header already used, extracted
 * so every page renders an identical avatar instead of five near-copies.
 */
export function AvatarLink({ firstName }: { firstName: string }) {
  return (
    <Link
      href="/profile"
      aria-label="Profile and settings"
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#F5B700] bg-white text-sm font-medium text-[#1B3A2D]"
    >
      {firstName.charAt(0).toUpperCase()}
    </Link>
  );
}
