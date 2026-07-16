/**
 * The small "which wearables we support" chip row shown wherever the app
 * asks a member to connect a device (the Dashboard unlock card, the Today
 * coaching brief, the first-time welcome modal). Reuses the exact
 * provider set and labels app/connections already established
 * (lib/wearables/providers/registry.ts's WEARABLE_PROVIDER_NAMES,
 * lib/wearables/labels.ts's WEARABLE_PROVIDER_LABEL) so this can never
 * drift out of sync with what /connections actually supports.
 *
 * Deliberately a plain icon + wordmark, not a reproduction of each
 * vendor's actual trademarked logo mark — this app has no license to
 * embed Oura's ring glyph, Apple's Health app icon, or Google's Fit
 * icon, and a close-but-not-quite copy would be worse than a clean,
 * consistent, brand-neutral treatment.
 */

import { Watch, HeartPulse, Activity } from 'lucide-react';
import type { WearableProviderName } from '@mef/shared-types-contracts';
import { WEARABLE_PROVIDER_LABEL } from '@/lib/wearables/labels';
import { WEARABLE_PROVIDER_NAMES } from '@/lib/wearables/providers/registry';

const PROVIDER_ICON: Record<WearableProviderName, typeof Watch> = {
  oura: Watch,
  apple_health: HeartPulse,
  google_fit: Activity,
};

export function ProviderLogos({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {WEARABLE_PROVIDER_NAMES.map((provider) => {
        const Icon = PROVIDER_ICON[provider];
        return (
          <span
            key={provider}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/10 bg-white px-3 py-1.5 text-xs font-medium text-[#1B3A2D]"
          >
            <Icon className="h-3.5 w-3.5 text-[#1B3A2D]/70" strokeWidth={1.75} aria-hidden="true" />
            {WEARABLE_PROVIDER_LABEL[provider]}
          </span>
        );
      })}
    </div>
  );
}
