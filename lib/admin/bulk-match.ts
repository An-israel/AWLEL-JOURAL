import { parseName } from "@/lib/citations";

export interface MatchableRow {
  key: string;
  title: string;
  authors: string[];
  firstPage: number | null;
  pdfFileName?: string;
  docxFileName?: string;
}

const STOP = new Set([
  "the",
  "and",
  "of",
  "in",
  "on",
  "a",
  "an",
  "to",
  "for",
  "with",
  "from",
  "as",
  "by",
  "its",
  "their",
]);

function tokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Picks the article row a dropped file belongs to: an exact file name from
 * the CSV wins; otherwise the first author's surname, the first page number
 * and title words in the file name are scored. Returns null when unsure, so
 * the editor chooses rather than the tool guessing wrong.
 */
export function matchFileToRow(fileName: string, rows: MatchableRow[]): string | null {
  const lower = fileName.toLowerCase();
  const exact = rows.find(
    (r) => r.pdfFileName?.toLowerCase() === lower || r.docxFileName?.toLowerCase() === lower,
  );
  if (exact) return exact.key;

  const fileTokens = new Set(tokens(fileName.replace(/\.(pdf|docx)$/i, "")));
  const scored = rows
    .map((row) => {
      let score = 0;
      const surname = row.authors[0] ? tokens(parseName(row.authors[0]).family)[0] : undefined;
      if (surname && fileTokens.has(surname)) score += 3;
      if (row.firstPage && fileTokens.has(String(row.firstPage))) score += 2;
      for (const word of new Set(tokens(row.title)))
        if (word.length > 3 && !STOP.has(word) && fileTokens.has(word)) score += 1;
      return { key: row.key, score };
    })
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  if (!best || best.score < 2) return null;
  if (second && second.score === best.score) return null;
  return best.key;
}
