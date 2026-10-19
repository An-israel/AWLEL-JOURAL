// Writes Supabase's own email templates (supabase/templates/*.html) in the
// journal's design, from the same wording the site uses.
//
// The site sends account emails itself once Resend is set up, so these are
// only a fallback: until then, Supabase sends them (to its own team only).
// They also style the local development emails (supabase/config.toml).
//
// Run after changing lib/email/*: node --no-warnings scripts/build-email-templates.mts
// A unit test fails if the files are out of date.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseTemplates } from "../lib/email/supabase-templates.ts";

const dir = join(import.meta.dirname, "..", "supabase", "templates");
for (const t of supabaseTemplates()) {
  writeFileSync(join(dir, t.file), t.html);
  console.log(`${t.file}  (subject: ${t.subject})`);
}
