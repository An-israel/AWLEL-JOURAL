import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requireRole } from "@/lib/auth";
import { withHomeDefaults } from "@/lib/home-content";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomeEditor } from "./home-editor";

export const metadata: Metadata = { title: "Home page" };

async function Content() {
  await requireRole(["super_admin"], "/admin/home-page");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("version, home_content, subtitle, journal_name, issn, license_name")
    .eq("id", 1)
    .single();
  if (error) throw new Error("Could not load the home page settings");
  const badges = [`ISSN ${data.issn}`, data.license_name ? "Open access" : null, "Peer reviewed"]
    .filter(Boolean)
    .join(" · ");
  return (
    <HomeEditor
      initial={withHomeDefaults(data.home_content)}
      version={data.version}
      fromSettings={{ subtitle: data.subtitle, journalName: data.journal_name, badges }}
    />
  );
}

export default function HomePageAdmin() {
  return (
    <>
      <AdminPageHeader
        title="Home page"
        crumbs={[{ label: "Home page" }]}
        description="Change any text on the home page, or hide a section. The issue covers, article lists and subjects fill themselves in from what you publish."
      />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-line" aria-busy="true" />}>
        <Content />
      </Suspense>
    </>
  );
}
