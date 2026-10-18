// Initials for a portrait placeholder (item 36). Titles are dropped first
// ("Prof. Dr. Ngozi Okeke" → "NO"), and any letter counts, so names that
// begin with Ọ, Ẹ or Ṣ keep their initial.

const HONORIFICS = new Set([
  "professor",
  "prof",
  "dr",
  "rev",
  "fr",
  "revd",
  "engr",
  "chief",
  "barr",
  "sir",
  "mrs",
  "ms",
  "mr",
  "miss",
  "arc",
  "pharm",
  "assoc",
  "emeritus",
]);

/** First letter of a word, with any combining accent kept (Ọ written as O + dot below). */
function firstLetter(word: string): string | null {
  return word.match(/^\p{L}\p{M}*/u)?.[0] ?? null;
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  // Leading titles, possibly several ("Prof. Dr.", "Rev. Fr."), with or without full stops.
  while (words.length > 1 && HONORIFICS.has(words[0].toLowerCase().replace(/[.,]/g, ""))) words.shift();
  const letters = words.map(firstLetter).filter((l): l is string => Boolean(l));
  const first = letters[0] ?? "";
  const last = letters.length > 1 ? letters[letters.length - 1] : "";
  return (first + last).toLocaleUpperCase("en-GB");
}
