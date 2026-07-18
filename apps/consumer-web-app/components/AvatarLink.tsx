'use client';

/**
 * The single, consistent Profile entry point (Premium UX Milestone 1),
 * placed at the top-right of every primary screen. Premium Dashboard
 * Experience milestone, part 3: rather than navigating straight to
 * /profile, it now opens ProfileSheet — a premium bottom sheet with
 * Profile/Membership/Connected Devices/Notifications/Settings/Help &
 * Support/About Rooted Reset and Sign Out — reusing the exact same
 * open/close/Escape/scroll-lock mechanics FloatingCoachLauncher already
 * established, so the app has one consistent sheet pattern instead of two.
 * Kept the same component name and `{ firstName }` prop so every existing
 * call site needed zero changes.
 */

import { useCallback, useEffect, useState } from 'react';
import { ProfileSheet } from '@/components/ProfileSheet';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export function AvatarLink({ firstName }: { firstName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useBodyScrollLock(isOpen);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(() => setIsOpen(false), 150);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Profile menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#F5B700] bg-white text-sm font-medium text-[#1B3A2D] transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
      >
        {firstName.charAt(0).toUpperCase()}
      </button>

      {isOpen && <ProfileSheet firstName={firstName} visible={visible} onClose={close} />}
    </>
  );
}
