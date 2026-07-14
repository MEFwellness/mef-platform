'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Watch, HeartPulse, Activity, CheckCircle2, RefreshCw, Unlink } from 'lucide-react';
import type { WearableConnection, WearableProviderName } from '@mef/shared-types-contracts';
import {
  connectWearableProvider,
  disconnectWearableProviderAction,
  syncWearableProviderAction,
} from '@/app/actions/wearables';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const PROVIDER_ICON: Record<WearableProviderName, typeof Watch> = {
  oura: Watch,
  apple_health: HeartPulse,
  google_fit: Activity,
};

const PROVIDER_LABEL: Record<WearableProviderName, string> = {
  oura: 'Oura',
  apple_health: 'Apple Health',
  google_fit: 'Google Fit',
};

function formatLastSynced(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'Never synced';
  const date = new Date(lastSyncedAt);
  return `Last synced ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function WearableConnectionCard({
  provider,
  connection,
}: {
  provider: WearableProviderName;
  connection: WearableConnection | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const Icon = PROVIDER_ICON[provider];
  const isConnected = connection?.status === 'connected';

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={`${CARD} p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1B3A2D]/[0.06]">
            <Icon className="h-5 w-5 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-semibold text-[#1B3A2D]">{PROVIDER_LABEL[provider]}</p>
            {isConnected ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#6B7A72]">
                <CheckCircle2
                  className="h-3.5 w-3.5 text-[#1B3A2D]/60"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {connection?.provider_status === 'active'
                  ? formatLastSynced(connection.last_synced_at)
                  : 'Connected — waiting on integration to go live'}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-[#6B7A72]">Not connected</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isConnected ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => syncWearableProviderAction(connection!.id))}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/10 px-4 py-2 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.06] disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Sync now
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => disconnectWearableProviderAction(connection!.id))}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/10 px-4 py-2 text-sm font-medium text-[#6B7A72] transition hover:border-red-200 hover:text-red-700 disabled:opacity-50"
            >
              <Unlink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => connectWearableProvider(provider))}
            className="rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Connect {PROVIDER_LABEL[provider]}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
