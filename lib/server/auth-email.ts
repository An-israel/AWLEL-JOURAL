import "server-only";
import {
  confirmEmail,
  existingAccountEmail,
  invitationEmail,
  passwordResetEmail,
  type AccountEmail,
} from "@/lib/email/auth-emails";
import { siteUrl } from "@/lib/env.public";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailConfigured } from "./email";
import { enqueueJob, runJobNow } from "./jobs";
import { logger } from "./logger";

/*
 * Account emails sent by the site itself. Supabase only makes the one-time
 * link (admin generateLink never emails anyone); the email goes out through
 * Resend like every other email, in the journal's design. So Supabase needs
 * no SMTP settings or templates, and its low built-in email limits don't
 * apply. The links use token_hash, which works in any browser on any device.
 *
 * Only while Resend isn't set up do the callers fall back to Supabase's own
 * emails (which reach the Supabase team only); see accountEmailsBySite().
 */

/** True when the site sends account emails itself (Resend is set up). */
export function accountEmailsBySite(): boolean {
  return emailConfigured();
}

type LinkType = "signup" | "magiclink" | "recovery" | "invite";

function callbackLink(tokenHash: string, type: LinkType, next: string): string {
  const qs = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `${siteUrl}/auth/callback?${qs}`;
}

async function deliver(to: string, email: AccountEmail, kind: string): Promise<void> {
  // Every link is new, so every email is too: a random key, never a repeat.
  const key = `account:${kind}:${crypto.randomUUID()}`;
  const jobId = await enqueueJob(
    "email.send",
    { to, subject: email.subject, heading: email.heading, text: email.text },
    key,
  );
  if (jobId)
    await runJobNow(jobId).catch((err: unknown) => logger.warn({ err, kind }, "account email deferred"));
}

interface Account {
  id: string;
  name: string | null;
  active: boolean;
  confirmed: boolean;
}

/** The account for an email address, if there is one. */
async function findAccount(email: string): Promise<Account | null> {
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (!profile) return null;
  const { data } = await admin.auth.admin.getUserById(profile.id);
  return {
    id: profile.id,
    name: profile.full_name,
    active: profile.is_active,
    confirmed: Boolean(data.user?.email_confirmed_at),
  };
}

async function generate(
  type: LinkType,
  email: string,
  extra: { password?: string; data?: Record<string, string> } = {},
) {
  const admin = createSupabaseAdminClient();
  const params =
    type === "signup"
      ? { type, email, password: extra.password ?? "", options: { data: extra.data } }
      : type === "invite"
        ? { type, email, options: { data: extra.data } }
        : { type, email };
  return admin.auth.admin.generateLink(params as Parameters<typeof admin.auth.admin.generateLink>[0]);
}

/** A confirmation link for an existing, unconfirmed account (a magic link confirms it). */
async function sendConfirmationTo(email: string, account: Account, again: boolean) {
  const { data, error } = await generate("magiclink", email);
  if (error || !data.properties) {
    logger.warn({ code: error?.code }, "confirmation link failed");
    return;
  }
  const link = callbackLink(data.properties.hashed_token, "magiclink", "/account");
  await deliver(email, confirmEmail({ name: account.name, link, again }), "confirm");
}

export type SignUpResult = { ok: true } | { ok: false; reason: "weak_password" | "failed" };

/**
 * A new author account. The answer is the same whether or not the address
 * is already registered: a new account gets a confirmation link, an
 * unconfirmed one a fresh link, and an existing one a note saying so.
 */
export async function signUpWithEmail(p: {
  email: string;
  password: string;
  fullName: string;
  affiliation: string;
}): Promise<SignUpResult> {
  const existing = await findAccount(p.email);
  if (existing) {
    if (!existing.confirmed) await sendConfirmationTo(p.email, existing, true);
    else if (existing.active)
      await deliver(p.email, existingAccountEmail({ name: existing.name, siteUrl }), "exists");
    return { ok: true };
  }

  const { data, error } = await generate("signup", p.email, {
    password: p.password,
    data: { full_name: p.fullName, affiliation: p.affiliation },
  });
  if (error || !data.properties) {
    if (error?.code === "weak_password") return { ok: false, reason: "weak_password" };
    logger.warn({ code: error?.code }, "sign-up link failed");
    return { ok: false, reason: "failed" };
  }
  const link = callbackLink(data.properties.hashed_token, "signup", "/account");
  await deliver(p.email, confirmEmail({ name: p.fullName, link }), "signup");
  return { ok: true };
}

/** "Resend the confirmation email": only unconfirmed accounts get one. */
export async function resendConfirmationEmail(email: string): Promise<void> {
  const account = await findAccount(email);
  if (account && !account.confirmed) await sendConfirmationTo(email, account, true);
}

/** A password reset link, for active accounts only. */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const account = await findAccount(email);
  if (!account || !account.active) return;
  const { data, error } = await generate("recovery", email);
  if (error || !data.properties) {
    logger.warn({ code: error?.code }, "reset link failed");
    return;
  }
  const link = callbackLink(data.properties.hashed_token, "recovery", "/reset-password");
  await deliver(email, passwordResetEmail({ name: account.name, link }), "reset");
}

/** What each role does, in full sentences for the invitation. */
const ROLE_IN_EMAIL: Record<UserRole, string> = {
  author: "Authors submit manuscripts and follow them through review.",
  reviewer:
    "Reviewers read the manuscripts the editors send them and recommend whether to publish, without seeing who wrote them.",
  editor: "Editors run the journal day to day: issues, articles, submissions, reviews and messages.",
  super_admin:
    "Super Admins can do everything an editor can, and also manage users and roles, settings and the site's pages.",
};

export type InviteResult = { ok: true; userId: string } | { ok: false; reason: "exists" | "failed" };

/** Creates the invited person's account and emails them the link to choose a password. */
export async function inviteByEmail(p: {
  email: string;
  fullName: string;
  role: UserRole;
  invitedBy: string | null;
}): Promise<InviteResult> {
  const { data, error } = await generate("invite", p.email, { data: { full_name: p.fullName } });
  if (error || !data.properties || !data.user) {
    const exists = error?.code === "email_exists" || /already been registered/i.test(error?.message ?? "");
    if (!exists) logger.error({ code: error?.code }, "invite link failed");
    return { ok: false, reason: exists ? "exists" : "failed" };
  }
  const link = callbackLink(data.properties.hashed_token, "invite", "/reset-password");
  await deliver(
    p.email,
    invitationEmail({
      name: p.fullName,
      link,
      roleLabel: ROLE_LABELS[p.role],
      roleDescription: ROLE_IN_EMAIL[p.role],
      invitedBy: p.invitedBy,
    }),
    "invite",
  );
  return { ok: true, userId: data.user.id };
}
