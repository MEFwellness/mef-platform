/**
 * Root "thinking" indicator — extracted from app/conversation/ConversationView.tsx
 * for reuse in the floating coach panel. Uses the same calm breathing pulse
 * (mef-pulse-dot, globals.css) as the rest of the app's "waiting" states
 * rather than a bouncing-dots animation, so it reads as an unhurried coach
 * considering a reply, not a generic chat-app typing cue.
 */
export function TypingIndicator() {
  return (
    <div className="flex justify-start py-1">
      <div className="flex items-center gap-1 rounded-3xl border border-[#1B3A2D]/[0.06] bg-white px-4 py-3 shadow-[0_2px_16px_-4px_rgba(27,58,45,0.08)]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="mef-pulse-dot h-1.5 w-1.5 rounded-full bg-[#1B3A2D]/40"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
