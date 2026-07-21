/** Bolds the first occurrence of `query` inside `text` (case-insensitive) so a member scanning a results grid can see at a glance why a card matched. Falls back to plain text when there's no match — never throws on regex-special characters in a member-typed query. */
export function HighlightMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;

  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) return <>{text}</>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + trimmed.length);
  const after = text.slice(index + trimmed.length);

  return (
    <>
      {before}
      <mark className="rounded-sm bg-[#F5B700]/35 text-[#1B3A2D]">{match}</mark>
      {after}
    </>
  );
}
