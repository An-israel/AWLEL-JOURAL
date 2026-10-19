import { confirmEmail, invitationEmail, passwordResetEmail, type AccountEmail } from "./auth-emails.ts";
import { DEFAULT_BRAND, renderEmailHtml } from "./render.ts";

/*
 * Supabase's own email templates in the journal's design: a fallback for
 * while Resend isn't set up (the site sends these emails itself once it is).
 * Links use token_hash, so they work in any browser on any device, and go
 * through /auth/callback like the site's own. Supabase fills in the
 * {{ … }} placeholders when it sends.
 */

export interface SupabaseTemplate {
  /** Name in Supabase → Authentication → Emails, and in supabase/config.toml. */
  name: "confirmation" | "invite" | "recovery" | "magic_link" | "email_change";
  file: string;
  subject: string;
  html: string;
}

const link = (type: string, next: string) =>
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=${type}&next=${next}`;

const brand = { ...DEFAULT_BRAND, siteUrl: "{{ .SiteURL }}" };

function build(name: SupabaseTemplate["name"], email: AccountEmail, url: string, label: string) {
  return {
    name,
    file: `${name}.html`,
    subject: email.subject,
    html:
      renderEmailHtml(
        { subject: email.subject, heading: email.heading, text: email.text, action: { label, url } },
        brand,
      ) + "\n",
  };
}

export function supabaseTemplates(): SupabaseTemplate[] {
  const confirm = link("email", "/account");
  const reset = link("recovery", "/reset-password");
  const invite = link("invite", "/reset-password");
  const magic = link("email", "/account");
  const change = link("email_change", "/account");
  return [
    build("confirmation", confirmEmail({ link: confirm }), confirm, "Confirm my email address"),
    build("recovery", passwordResetEmail({ link: reset }), reset, "Choose a new password"),
    build("invite", invitationEmail({ link: invite }), invite, "Accept the invitation"),
    build(
      "magic_link",
      {
        subject: "Your AWLEL sign-in link",
        heading: "Sign in to AWLEL",
        text: [
          "Dear colleague,",
          "Here is your link to sign in to AWLEL:",
          magic,
          "For your security, the link works only once and stops working after a while.",
          "If you didn't ask for it, you can ignore this email.",
        ].join("\n\n"),
      },
      magic,
      "Sign in",
    ),
    build(
      "email_change",
      {
        subject: "Confirm your new email address for AWLEL",
        heading: "Confirm your new email address",
        text: [
          "Dear colleague,",
          "Please confirm that you want to use {{ .NewEmail }} for your AWLEL account:",
          change,
          "If you didn't ask to change it, please contact the editorial office.",
        ].join("\n\n"),
      },
      change,
      "Confirm the new address",
    ),
  ];
}
