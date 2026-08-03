'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircleHeart, Circle } from 'lucide-react';
import type { Notification } from '@mef/shared-types-contracts';
import { markMyNotificationRead } from '@/app/actions/notifications';
import { Card } from '@/components/layout';

function formatWhen(createdAt: string): string {
  const date = new Date(createdAt);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CoachMessages({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (notifications.length === 0) return null;

  function markRead(id: string) {
    startTransition(async () => {
      await markMyNotificationRead(id);
      router.refresh();
    });
  }

  return (
    <Card as="section" className="mef-animate-in mt-6">
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <MessageCircleHeart className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Coach Messages</p>
      </div>
      <div className="mt-3 divide-y divide-[#1B3A2D]/5">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            type="button"
            disabled={isPending || Boolean(notification.read_at)}
            onClick={() => markRead(notification.id)}
            className="mef-press flex w-full items-start gap-2.5 py-3 text-left first:pt-0 last:pb-0 disabled:cursor-default"
          >
            {!notification.read_at && (
              <Circle
                className="mt-1.5 h-2 w-2 shrink-0 fill-[#F5B700] text-[#F5B700]"
                aria-hidden="true"
              />
            )}
            <div className={notification.read_at ? 'pl-[18px]' : ''}>
              <p className="text-sm font-medium text-[#1B3A2D]">{notification.title}</p>
              {notification.body && (
                <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">{notification.body}</p>
              )}
              <p className="mt-1 text-xs text-[#6B7A72]/70">
                {formatWhen(notification.created_at)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
