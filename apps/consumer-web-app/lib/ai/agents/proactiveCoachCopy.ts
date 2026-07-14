/**
 * The Proactive AI Coach's message composition — titles plus the shared
 * coaching voice (lib/brain/copy.ts), never its own independent wording.
 * Same discipline as every templated-copy module in this codebase: fixed
 * template plus real substituted values, never freeform/LLM-generated
 * text. Consolidating the actual sentences into lib/brain/copy.ts (rather
 * than duplicating them here) is what makes every proactive message sound
 * like the same premium holistic coach the Daily Coaching Brief already
 * uses, instead of two independently hand-written voices that could drift
 * apart over time.
 */

import {
  recoveryLevelText,
  hrvTrendDecliningText,
  sleepTrendDecliningText,
  activityTrendDecliningText,
  stressTrendRisingText,
  stressTrendEasingText,
  wearableConnectedText,
} from '../../brain/copy';
import { WEARABLE_PROVIDER_LABEL } from '../../wearables/labels';
import type { WearableProviderName } from '@mef/shared-types-contracts';

export type ProactiveCoachMessage = {
  title: string;
  body: string;
};

export function hrvDecliningMessage(): ProactiveCoachMessage {
  return { title: 'Your recovery is asking for attention', body: hrvTrendDecliningText() };
}

export function sleepDecliningMessage(): ProactiveCoachMessage {
  return { title: "Let's protect your sleep", body: sleepTrendDecliningText() };
}

export function recoveryExcellentMessage(): ProactiveCoachMessage {
  return { title: 'Your recovery looks excellent', body: recoveryLevelText('excellent') };
}

export function activityDeclinedMessage(): ProactiveCoachMessage {
  return { title: 'A little movement goes a long way', body: activityTrendDecliningText() };
}

export function stressRisingMessage(): ProactiveCoachMessage {
  return { title: "Let's ease the pressure", body: stressTrendRisingText() };
}

export function stressEasingMessage(): ProactiveCoachMessage {
  return { title: 'Your stress is easing', body: stressTrendEasingText() };
}

export function wearableConnectedMessage(provider: WearableProviderName): ProactiveCoachMessage {
  const label = WEARABLE_PROVIDER_LABEL[provider];
  return { title: `${label} connected`, body: wearableConnectedText(label) };
}
