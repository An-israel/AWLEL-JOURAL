import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FILE_COLUMNS, toAttached } from "@/lib/admin/files-data";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

async function Content() {
  await requireRole(["super_admin"], "/admin/settings");
  const supabase = await createSupabaseServerClient();
  const [{ data: s }, { data: flags }, { data: schemaVersion }] = await Promise.all([
    supabase
      .from("site_settings")
      .select(
        `version, journal_name, journal_short_name, subtitle, issn, publisher, contact_email, postal_address, publication_frequency, license_name, license_url, social_links,
         logo:stored_files!site_settings_logo_file_id_fkey(${FILE_COLUMNS}),
         og:stored_files!site_settings_default_og_image_file_id_fkey(${FILE_COLUMNS})`,
      )
      .eq("id", 1)
      .single(),
    supabase.from("feature_flags").select("key, enabled, description").order("key"),
    supabase.rpc("schema_version"),
  ]);
  if (!s) throw new Error("Site settings are missing. Run the seed.");
  const social = (s.social_links ?? {}) as Record<string, string>;
  return (
    <SettingsForm
      schemaVersion={schemaVersion ?? null}
      flags={flags ?? []}
      settings={{
        version: s.version,
        journalName: s.journal_name,
        shortName: s.journal_short_name,
        subtitle: s.subtitle,
        issn: s.issn,
        publisher: s.publisher,
        contactEmail: s.contact_email,
        postalAddress: s.postal_address ?? "",
        publicationFrequency: s.publication_frequency ?? "",
        licenseName: s.license_name ?? "",
        licenseUrl: s.license_url ?? "",
        social: {
          x: social.x ?? "",
          facebook: social.facebook ?? "",
          linkedin: social.linkedin ?? "",
          website: social.website ?? "",
        },
        logo: toAttached(s.logo),
        ogImage: toAttached(s.og),
      }}
    />
  );
}

export default function SettingsPage() {
  return (
    <>
      <AdminPageHeader title="Settings" crumbs={[{ label: "Settings" }]} />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" />}>
        <Content />
      </Suspense>
    </>
  );
}
