'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Circle } from 'lucide-react';
import type { Notification } from '@mef/shared-types-contracts';
import { markMyNotificationRead } from '@/app/actions/notifications';

function formatWhen(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function markRead(id: string) {
    startTransition(async () => {
      await markMyNotificationRead(id);
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-[#1B3A2D]/5">
      {notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          disabled={isPending || Boolean(notification.read_at)}
          onClick={() => markRead(notification.id)}
          className="flex w-full items-start gap-3 rounded-2xl px-3 py-3.5 text-left transition hover:bg-[#1B3A2D]/[0.03] disabled:cursor-default disabled:hover:bg-transparent"
        >
          {!notification.read_at && (
            <Circle
              className="mt-1.5 h-2 w-2 shrink-0 fill-[#F5B700] text-[#F5B700]"
              aria-hidden="true"
            />
          )}
          <div className={notification.read_at ? 'pl-[14px]' : ''}>
            <p className="text-sm font-medium text-[#1B3A2D]">{notification.title}</p>
            {notification.body && (
              <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">{notification.body}</p>
            )}
            <p className="mt-1 text-xs text-[#6B7A72]/70">{formatWhen(notification.created_at)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
