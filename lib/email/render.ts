/*
 * The journal's email design: one layout for every email the site sends,
 * from sign-up confirmations to review invitations. Each email is written
 * as plain text (which is also sent, for mail apps that prefer it); this
 * turns that text into the branded HTML version. A paragraph that ends in a
 * link on its own line becomes a button.
 *
 * Email clients ignore stylesheets and most modern CSS, so the layout uses
 * tables and inline styles only, with web-safe fonts. Pure functions with
 * no server imports: also used by scripts/build-email-templates.ts.
 */

export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailBrand {
  shortName: string;
  journalName: string;
  publisher: string;
  siteUrl: string;
}

export const DEFAULT_BRAND: EmailBrand = {
  shortName: "AWLEL",
  journalName: "African, World Literature and English Language",
  publisher: "Department of English and Literary Studies, University of Nigeria, Nsukka",
  siteUrl: "",
};

export interface RenderInput {
  subject: string;
  text: string;
  /** Large title above the text; defaults to the subject without its "[AWLEL …]" tag. */
  heading?: string;
  /** The main button. Without it, a paragraph ending in a link on its own line becomes one. */
  action?: EmailAction;
  /** Short line shown next to the subject in the inbox. */
  preheader?: string;
}

const C = {
  navy: "#1e3a8a",
  navyDeep: "#152a66",
  royal: "#2e66e8",
  gold: "#c99234",
  coral: "#c42d45",
  ink: "#111111",
  body: "#2b2b31",
  muted: "#4a4a52",
  paper: "#f7f7f8",
  page: "#eef0f5",
  line: "#e4e4e7",
};
const SANS = "Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

const URL_LINE = /^https?:\/\/\S+$/;
const URL_IN_TEXT = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"”’]/g;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A button label people understand, from where the link goes. */
export function labelForUrl(url: string): string {
  const type = /[?&]type=([a-z_]+)/.exec(url)?.[1];
  if (url.includes("/auth/callback")) {
    if (type === "recovery") return "Choose a new password";
    if (type === "invite") return "Accept the invitation";
    return "Confirm my email address";
  }
  if (url.includes("/admin/reviews/")) return "Open the review";
  if (url.includes("/admin/submissions/")) return "Open in the dashboard";
  if (url.includes("/account/submissions/")) return "View your submission";
  if (url.includes("/articles/")) return "Read the article";
  if (url.endsWith("/forgot-password")) return "Reset my password";
  if (url.endsWith("/login")) return "Sign in";
  return "Open";
}

function inline(text: string): string {
  // Escape first, then turn the (escaped) addresses into links.
  return escapeHtml(text)
    .replace(
      URL_IN_TEXT,
      (u) => `<a href="${u}" style="color:${C.navy};text-decoration:underline;word-break:break-all">${u}</a>`,
    )
    .replace(/\n/g, "<br>");
}

function button(action: EmailAction): string {
  const href = escapeHtml(action.url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
<tr><td align="center" bgcolor="${C.navy}" style="border-radius:6px;background:${C.navy}">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(action.label)}</a>
</td></tr></table>
<p style="margin:0 0 24px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">If the button doesn't work, copy this address into your browser:<br><a href="${href}" style="color:${C.navy};word-break:break-all">${href}</a></p>`;
}

function paragraph(html: string, muted = false): string {
  return muted
    ? `<p style="margin:0 0 16px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted}">${html}</p>`
    : `<p style="margin:0 0 16px;font-family:${SERIF};font-size:16px;line-height:1.65;color:${C.body}">${html}</p>`;
}

/** The text's paragraphs as HTML, with the first link-only line (or `action`) as the button. */
function bodyHtml(text: string, action?: EmailAction): string {
  let buttonUsed = false;
  const out: string[] = [];
  for (const block of text.trim().split(/\n{2,}/)) {
    const lines = block.split("\n");
    const last = lines[lines.length - 1].trim();
    // Supabase's templates use placeholders such as {{ .SiteURL }}, so the action's URL counts too.
    const isLink = URL_LINE.test(last) || last === action?.url;
    const matchesAction = action ? last === action.url : true;
    if (isLink && !buttonUsed && matchesAction) {
      const lead = lines.slice(0, -1).join("\n").trim();
      if (lead) out.push(paragraph(inline(lead)));
      out.push(button(action ?? { label: labelForUrl(last), url: last }));
      buttonUsed = true;
      continue;
    }
    // Sign-offs such as "— AWLEL website" and small print read as quieter text.
    out.push(paragraph(inline(block), block.startsWith("— ")));
  }
  if (action && !buttonUsed) out.push(button(action));
  return out.join("\n");
}

function headingOf(input: RenderInput): string {
  return input.heading ?? input.subject.replace(/^\[[^\]]+\]\s*/, "");
}

function preheaderOf(input: RenderInput): string {
  if (input.preheader) return input.preheader;
  // The first sentence after the greeting.
  const paragraphs = input.text.trim().split(/\n{2,}/);
  const first = (/^(Dear|Hello|Hi)\b/.test(paragraphs[0] ?? "") ? paragraphs[1] : paragraphs[0]) ?? "";
  return first.replace(/\s+/g, " ").slice(0, 140);
}

/** The branded HTML version of an email. */
export function renderEmailHtml(input: RenderInput, brand: EmailBrand = DEFAULT_BRAND): string {
  const site = brand.siteUrl.replace(/\/$/, "");
  const siteLabel = site.replace(/^https?:\/\//, "");
  const stripe = (color: string, width: string) =>
    `<td width="${width}" height="6" style="height:6px;line-height:6px;font-size:0;background:${color}" bgcolor="${color}">&nbsp;</td>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheaderOf(input))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${stripe(C.navy, "58%")}${stripe(C.ink, "14%")}${stripe(C.gold, "4%")}${stripe(C.royal, "24%")}
</tr></table>
</td></tr>
<tr><td bgcolor="${C.navy}" style="background:${C.navy};padding:26px 32px 24px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${SANS};font-size:28px;font-weight:bold;letter-spacing:-0.5px;line-height:1;color:#ffffff">${escapeHtml(brand.shortName)}</td>
<td style="padding-left:10px;vertical-align:middle"><span style="display:inline-block;background:${C.coral};color:#ffffff;font-family:${SANS};font-size:10px;font-weight:bold;letter-spacing:2px;line-height:1;padding:5px 7px;border-radius:2px">JOURNAL</span></td>
</tr></table>
<div style="margin-top:8px;font-family:${SANS};font-size:13px;line-height:1.4;color:#d5dcf2">${escapeHtml(brand.journalName)}</div>
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:32px 32px 12px">
<h1 style="margin:0 0 6px;font-family:${SANS};font-size:22px;font-weight:bold;line-height:1.3;color:${C.ink}">${escapeHtml(headingOf(input))}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td width="56" height="3" style="height:3px;line-height:3px;font-size:0;background:${C.gold}" bgcolor="${C.gold}">&nbsp;</td></tr></table>
${bodyHtml(input.text, input.action)}
</td></tr>
<tr><td bgcolor="${C.paper}" style="background:${C.paper};border-top:1px solid ${C.line};padding:22px 32px 26px">
<p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:bold;line-height:1.5;color:${C.navy}">${escapeHtml(brand.shortName)} · ${escapeHtml(brand.journalName)}</p>
<p style="margin:0 0 10px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">${escapeHtml(brand.publisher)}</p>
${site ? `<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6"><a href="${escapeHtml(site)}" style="color:${C.navy};text-decoration:none;font-weight:bold">${escapeHtml(siteLabel)}</a></p>` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
