/**
 * Root Presence System (Prompt 4), requirement 6: Discovery Moments —
 * dashboard entry point. Same self-fetching-Server-Component-into-
 * NoticingTile shape as CoachingMessageCard.tsx ("From Root"): its own
 * data (getMyNewDiscoveryAction) streams in independently via the
 * Suspense boundary the dashboard wraps it in, and renders nothing when
 * there is no genuinely new finding — never a forced or scheduled
 * discovery (silence-until-evidence, same as the correlation engine's own
 * design).
 *
 * Deliberately its own card in this carousel, not folded into
 * WhatWereNoticingCard.tsx ("What We're Noticing," a different, registry-
 * findings-only surface) or the Root pop-up chain (app/actions/
 * rootPopupMessages.ts, scoped to messages that expect an answer/
 * acknowledgment, not a one-time observation, and where a 5th message
 * kind would be starved behind day-3/day-7/offer messages for any member
 * mid-experiment) — see docs/motion-experience-bible.md §11's own
 * "Discovery moment slots... in the 'What Root Is Noticing' zone" for the
 * placement this follows.
 *
 * The one-time "I noticed something. Want to see?" reveal itself lives
 * inside the tap-opened NoticingSheet, using the Progressive Reveal
 * Engine's ConversationFlow — a brief thinking beat, then the real,
 * already-earned finding sentence Case View's own FindingsList would
 * otherwise have shown silently.
 */

import { getMyNewDiscoveryAction } from '@/app/actions/discoveryMoments';
import { NoticingTile } from './NoticingTile';
import { ConversationFlow } from '@/components/reveal/ConversationFlow';

export async function RootDiscoveryCard() {
  const finding = await getMyNewDiscoveryAction();
  if (!finding) return null;

  return (
    <NoticingTile
      imageSrc="/images/card-noticing.jpg"
      kicker="Root noticed something"
      headline="Want to see?"
      sheetTitle="Root noticed something"
    >
      <ConversationFlow
        messages={['Looking at your last couple of weeks...', finding.memberSentence]}
        messageClassName="text-[15px] leading-relaxed text-[#1B3A2D]"
      />
    </NoticingTile>
  );
}
