import { Mail, MapPin } from "lucide-react";
import { StaticPage } from "@/components/pages/static-page";
import { staticPageMetadata } from "@/lib/data/page-metadata";
import { getPage } from "@/lib/data/pages";
import { getSiteSettings } from "@/lib/data/site-settings";
import { ContactForm } from "./contact-form";

export const generateMetadata = () => staticPageMetadata("contact", "Contact Us");

export default async function ContactPage() {
  const [page, settings] = await Promise.all([getPage("contact"), getSiteSettings()]);
  const mapQuery = encodeURIComponent(
    "Department of English and Literary Studies, University of Nigeria, Nsukka",
  );

  return (
    <StaticPage
      eyebrow="Contact"
      title={page?.title ?? "Contact Us"}
      content={page?.content ?? null}
      afterContent={
        <div className="mt-10 max-w-3xl">
          <ContactForm />
        </div>
      }
      aside={
        <section aria-labelledby="office-title" className="rounded-lg border border-line bg-white p-5">
          <h2 id="office-title" className="text-base font-semibold">
            Editorial office
          </h2>
          <ul className="mt-4 space-y-4 text-sm">
            <li className="flex gap-3">
              <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-dark" />
              <a href={`mailto:${settings.contactEmail}`} className="font-medium break-words">
                {settings.contactEmail}
              </a>
            </li>
            <li className="flex gap-3">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-dark" />
              <address className="text-ink-muted not-italic">
                {settings.postalAddress}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block font-medium"
                >
                  Open in Google Maps<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </address>
            </li>
          </ul>
        </section>
      }
    />
  );
}
