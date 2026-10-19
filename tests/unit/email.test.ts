import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { confirmEmail, existingAccountEmail, invitationEmail } from "@/lib/email/auth-emails";
import { labelForUrl, renderEmailHtml } from "@/lib/email/render";
import { supabaseTemplates } from "@/lib/email/supabase-templates";

const brand = {
  shortName: "AWLEL",
  journalName: "African, World Literature and English Language",
  publisher: "Department of English and Literary Studies, University of Nigeria, Nsukka",
  siteUrl: "https://awlel.test",
};

describe("the email design", () => {
  it("turns a paragraph ending in a link into a button named for where it goes", () => {
    const html = renderEmailHtml(
      {
        subject: "Manuscript received: A Title",
        text: "Dear Ada,\n\nYou can follow its progress at any time:\nhttps://awlel.test/account/submissions/1\n\nYours sincerely",
      },
      brand,
    );
    expect(html).toContain(">View your submission</a>");
    expect(html).toContain('href="https://awlel.test/account/submissions/1"');
    expect(html).toContain("You can follow its progress at any time:");
    expect(html).toContain("<title>Manuscript received: A Title</title>");
  });

  it("makes only the first link a button; later ones stay links in the text", () => {
    const html = renderEmailHtml(
      {
        subject: "Two links",
        text: "First:\nhttps://awlel.test/login\n\nAlso see https://awlel.test/forgot-password today.",
      },
      brand,
    );
    expect(html.match(/padding:14px 28px/g)).toHaveLength(1);
    expect(html).toContain('<a href="https://awlel.test/forgot-password"');
  });

  it("escapes what people typed, so a message can't add HTML", () => {
    const html = renderEmailHtml(
      { subject: "<b>Hi</b>", text: 'From: <script>alert("x")</script> & co' },
      brand,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; co");
  });

  it("drops the [AWLEL …] tag from the heading and shows the journal in the footer", () => {
    const html = renderEmailHtml({ subject: "[AWLEL] New submission: X", text: "Body." }, brand);
    expect(html).toMatch(/<h1[^>]*>New submission: X<\/h1>/);
    expect(html).toContain("University of Nigeria, Nsukka");
    expect(html).toContain(">awlel.test</a>");
  });

  it("names buttons by where they lead", () => {
    expect(labelForUrl("https://x/auth/callback?token_hash=a&type=recovery")).toBe("Choose a new password");
    expect(labelForUrl("https://x/auth/callback?token_hash=a&type=invite")).toBe("Accept the invitation");
    expect(labelForUrl("https://x/auth/callback?token_hash=a&type=signup")).toBe("Confirm my email address");
    expect(labelForUrl("https://x/admin/reviews/1")).toBe("Open the review");
    expect(labelForUrl("https://x/somewhere")).toBe("Open");
  });
});

describe("account emails", () => {
  it("confirmation greets by name, or as colleague, and carries the link", () => {
    const e = confirmEmail({ name: "Ngozi", link: "https://awlel.test/auth/callback?token_hash=t" });
    expect(e.text.startsWith("Dear Ngozi,")).toBe(true);
    expect(e.text).toContain("https://awlel.test/auth/callback?token_hash=t");
    expect(confirmEmail({ name: "  ", link: "x" }).text.startsWith("Dear colleague,")).toBe(true);
  });

  it("an existing account is pointed to sign-in, not told a new account was made", () => {
    const e = existingAccountEmail({ name: "Ada", siteUrl: "https://awlel.test" });
    expect(e.text).toContain("https://awlel.test/login");
    expect(e.text).toContain("you already have one");
  });

  it("invitations name the role with the right article", () => {
    expect(invitationEmail({ link: "x", roleLabel: "Editor" }).subject).toBe(
      "You're invited to join AWLEL as an Editor",
    );
    expect(invitationEmail({ link: "x", roleLabel: "Reviewer" }).subject).toBe(
      "You're invited to join AWLEL as a Reviewer",
    );
    expect(invitationEmail({ link: "x", invitedBy: "Prof. Eze" }).text).toContain(
      "Prof. Eze has invited you",
    );
  });
});

describe("Supabase's own templates", () => {
  it("match the generated files (run scripts/build-email-templates.mts after changing them)", () => {
    for (const t of supabaseTemplates()) {
      const onDisk = readFileSync(join(process.cwd(), "supabase", "templates", t.file), "utf8");
      expect(onDisk, t.file).toBe(t.html);
    }
  });

  it("link through /auth/callback with token_hash, so they work on any device", () => {
    for (const t of supabaseTemplates()) {
      expect(t.html, t.name).toContain("{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=");
    }
  });

  it("subjects match supabase/config.toml", () => {
    const config = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8");
    for (const t of supabaseTemplates()) {
      expect(config, t.name).toContain(
        `[auth.email.template.${t.name}]\nsubject = "${t.subject}"\ncontent_path = "./supabase/templates/${t.file}"`,
      );
    }
  });
});
