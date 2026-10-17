// Obvious automated clients, by user agent (section 9). Not exhaustive: it
// keeps crawlers, link previewers, monitors and scripts out of the counts.
const BOT_PATTERN =
  /bot\b|bot\/|crawl|spider|slurp|scrap|archiver|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|bingpreview|headless|lighthouse|pagespeed|pingdom|uptime|monitor|checkly|curl\/|wget\/|python-|httpx|aiohttp|go-http-client|java\/|okhttp|libwww|node-fetch|axios\/|undici|postman|insomnia|scholar|citeseer|semantic|zotero|mendeley/i;

/** True for an empty user agent or one that names a known bot or tool. */
export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  return BOT_PATTERN.test(userAgent);
}
