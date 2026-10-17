export function pageRange(first: number | null, last: number | null): string | null {
  if (!first) return null;
  if (!last || last === first) return `p. ${first}`;
  return `pp. ${first}–${last}`;
}
