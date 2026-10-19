/*
 * Wording of the account emails: confirming a new account, resetting a
 * password and invitations to the editorial team. The site sends these
 * itself through Resend (lib/server/auth-email.ts), so Supabase needs no
 * email settings of its own. The same wording, with Supabase's placeholders,
 * also makes the optional Supabase dashboard templates
 * (scripts/build-email-templates.ts). Pure functions, UK English.
 */

export interface AccountEmail {
  subject: string;
  heading: string;
  text: string;
}

const SIGN_OFF =
  "\n\nWith best wishes,\n\nThe Editors, AWLEL\nAfrican, World Literature and English Language";

const greeting = (name: string | null | undefined) => `Dear ${name?.trim() || "colleague"},`;

const EXPIRY =
  "For your security, the link works only once and stops working after a while. If it has expired, you can ask for a new one on the sign-in page.";

export function confirmEmail(p: { name?: string | null; link: string; again?: boolean }): AccountEmail {
  return {
    subject: "Confirm your email address for AWLEL",
    heading: p.again ? "Confirm your email address" : "Welcome to AWLEL",
    text:
      [
        greeting(p.name),
        p.again
          ? "Here is a new link to confirm the email address for your AWLEL author account:"
          : "Thank you for creating an author account with AWLEL, the journal of African, World Literature and English Language. Please confirm your email address to activate it:",
        p.link,
        "Once your account is active, you can submit manuscripts and follow their progress through review from your account page.",
        EXPIRY,
        "If you didn't create this account, you can safely ignore this email.",
      ].join("\n\n") + SIGN_OFF,
  };
}

export function existingAccountEmail(p: { name?: string | null; siteUrl: string }): AccountEmail {
  return {
    subject: "Your AWLEL account",
    heading: "You already have an account",
    text:
      [
        greeting(p.name),
        "Someone, we hope you, just tried to create an AWLEL account with this email address, but you already have one. You can sign in here:",
        `${p.siteUrl}/login`,
        `If you've forgotten your password, you can choose a new one at ${p.siteUrl}/forgot-password`,
        "If this wasn't you, there is nothing to do: your account has not been changed.",
      ].join("\n\n") + SIGN_OFF,
  };
}

export function passwordResetEmail(p: { name?: string | null; link: string }): AccountEmail {
  return {
    subject: "Reset your AWLEL password",
    heading: "Choose a new password",
    text:
      [
        greeting(p.name),
        "We received a request to reset the password for your AWLEL account. Choose a new password here:",
        p.link,
        EXPIRY,
        "If you didn't ask to reset your password, you can ignore this email; your password stays as it is.",
      ].join("\n\n") + SIGN_OFF,
  };
}

const ARTICLE: Record<string, string> = { Author: "an", Editor: "an" };

export function invitationEmail(p: {
  name?: string | null;
  link: string;
  /** Unknown in Supabase's own template, where the role is set after the invitation. */
  roleLabel?: string;
  roleDescription?: string;
  invitedBy?: string | null;
}): AccountEmail {
  const who = p.invitedBy?.trim() ? `${p.invitedBy.trim()} has` : "The editors have";
  const a = p.roleLabel ? (ARTICLE[p.roleLabel] ?? "a") : "";
  const as = p.roleLabel ? ` as ${a} ${p.roleLabel}` : "";
  return {
    subject: `You're invited to join AWLEL${as}`,
    heading: "You're invited to join AWLEL",
    text:
      [
        greeting(p.name),
        `${who} invited you to join AWLEL${as}.${p.roleDescription ? ` ${p.roleDescription}` : ""}`,
        "To accept, open the link below and choose a password for your account:",
        p.link,
        "The invitation link works only once. If it has expired, use “Forgotten your password?” on the sign-in page with this email address, or ask the editorial office to invite you again.",
      ].join("\n\n") + SIGN_OFF,
  };
}
