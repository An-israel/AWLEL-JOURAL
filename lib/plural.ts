/**
 * A count with the right form of the word: "1 article", "3 articles",
 * "1,204 views". Pass the plural for words that don't just add an "s".
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? singular : pluralForm}`;
}
