import { StaticPage } from "@/components/pages/static-page";
import { staticPageMetadata } from "@/lib/data/page-metadata";
import { getPage } from "@/lib/data/pages";

export const generateMetadata = () => staticPageMetadata("privacy", "Privacy Policy");

export default async function PrivacyPage() {
  const page = await getPage("privacy");
  return (
    <StaticPage eyebrow="Privacy" title={page?.title ?? "Privacy Policy"} content={page?.content ?? null} />
  );
}
