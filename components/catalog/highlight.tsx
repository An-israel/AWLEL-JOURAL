/** Renders search highlights marked with [[[ ]]] as <mark>, never as raw HTML. */
export function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\[\[\[.*?\]\]\])/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("[[[") && part.endsWith("]]]") ? (
          <mark key={i} className="rounded-sm bg-gold-light/60 px-0.5 text-ink">
            {part.slice(3, -3)}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
