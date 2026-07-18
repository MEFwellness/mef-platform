'use client';

/**
 * Premium Dashboard Experience milestone, part 3 — the profile bottom
 * sheet opened by tapping the avatar (AvatarLink.tsx, which owns open/close
 * state and mounts this). Deliberately a fixed, short list — Profile,
 * Membership, Connected Devices, Notifications, Settings, Help & Support,
 * About Rooted Reset, then Sign Out below a divider — not a dumping ground
 * for every account-adjacent page in the app. Mirrors the same bottom-sheet
 * mechanics FloatingCoachPanel/FloatingCoachLauncher already established
 * (backdrop fade, translate-up entrance, safe-area-aware padding, Escape to
 * close) so the two sheets in this app feel like one system.
 */

import Link from 'next/link';
import type { Route } from 'next';
import {
  User,
  Gem,
  Watch,
  Bell,
  Settings as SettingsIcon,
  LifeBuoy,
  Info,
  X,
} from 'lucide-react';
import { SignOutButton } from '@/components/SignOutButton';

const MENU_ITEMS: { label: string; href: Route; Icon: typeof User }[] = [
  { label: 'Profile', href: '/profile', Icon: User },
  { label: 'Membership', href: '/membership', Icon: Gem },
  { label: 'Connected Devices', href: '/connections', Icon: Watch },
  { label: 'Notifications', href: '/notifications', Icon: Bell },
  { label: 'Settings', href: '/settings', Icon: SettingsIcon },
  { label: 'Help & Support', href: '/help', Icon: LifeBuoy },
  { label: 'About Rooted Reset', href: '/about', Icon: Info },
];

export function ProfileSheet({
  firstName,
  visible,
  onClose,
}: {
  firstName: string;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-[#1B3A2D]/20 backdrop-blur-[1px] transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        className={`fixed inset-x-0 bottom-0 z-50 flex w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-12px_48px_-8px_rgba(27,58,45,0.35)] transition-[opacity,transform] duration-200 ease-out sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-[380px] sm:rounded-[28px] sm:shadow-[0_12px_48px_-8px_rgba(27,58,45,0.35)] ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-[#1B3A2D]/15" aria-hidden="true" />
        </div>

        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-2 sm:pt-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#F5B700] bg-white text-sm font-medium text-[#1B3A2D]">
              {firstName.charAt(0).toUpperCase()}
            </span>
            <p className="font-[family-name:var(--font-cormorant-garamond)] text-lg leading-tight text-[#1B3A2D]">
              {firstName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile menu"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#1B3A2D]/50 transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <nav className="flex flex-col px-2 pb-2" aria-label="Profile">
          {MENU_ITEMS.map(({ label, href, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.05]"
            >
              <Icon className="h-5 w-5 shrink-0 text-[#1B3A2D]/60" strokeWidth={1.75} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mx-5 border-t border-[#1B3A2D]/8" />

        <div className="px-2 pb-3 pt-2">
          <SignOutButton variant="row" />
        </div>
      </div>
    </>
  );
}
