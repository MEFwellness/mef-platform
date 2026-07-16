/**
 * A single conversation message bubble — extracted from
 * app/conversation/ConversationView.tsx so both the full Conversation
 * Coach page and the floating coach's compact panel
 * (components/FloatingCoachPanel.tsx) render messages identically instead
 * of duplicating this markup (part 5's "avoid duplicate conversation
 * logic"). The only new behavior versus the original inline version is
 * the SpeakerButton on member-visible coach_ai messages (part 2).
 */

import type { ConversationMessage } from '@mef/shared-types-contracts';
import { SpeakerButton } from './SpeakerButton';

export function Bubble({ message }: { message: ConversationMessage }) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-1.5">
        <p className="max-w-[85%] rounded-2xl bg-[#1B3A2D]/[0.05] px-4 py-2 text-center text-xs leading-relaxed text-[#6B7A72]">
          {message.content}
        </p>
      </div>
    );
  }

  const isMember = message.role === 'member';
  const showSpeaker = !isMember && message.member_visible && message.id !== 'pending';

  return (
    <div className={`flex min-w-0 ${isMember ? 'justify-end' : 'justify-start'} py-1`}>
      <div className={`flex min-w-0 max-w-[80%] flex-col ${isMember ? 'items-end' : 'items-start'}`}>
        <div
          className={`min-w-0 max-w-full whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
            isMember
              ? 'bg-[#1B3A2D] text-white'
              : 'border border-[#1B3A2D]/[0.06] bg-white text-[#1B3A2D] shadow-[0_2px_16px_-4px_rgba(27,58,45,0.08)]'
          }`}
        >
          {message.content}
        </div>
        {showSpeaker && <SpeakerButton id={message.id} text={message.content} />}
      </div>
    </div>
  );
}
