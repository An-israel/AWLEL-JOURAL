import { cacheLife } from "next/cache";
import Link from "next/link";
import { getSiteSettings } from "@/lib/data/site-settings";
import { FOOTER_LINKS } from "@/lib/site";
import { LogoMark } from "./logo";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export async function SiteFooter() {
  const settings = await getSiteSettings();

  return (
    <footer className="mt-24 bg-navy-deep text-white/85">
      <div className="accent-bands h-1" aria-hidden />
      <div className="mx-auto grid max-w-site gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark className="size-10 text-white" />
            <span className="text-xl font-bold tracking-tight text-white">{settings.shortName}</span>
          </div>
          <p className="mt-4 max-w-sm font-medium text-white">{settings.journalName}</p>
          <p className="mt-1 max-w-sm text-sm">{settings.subtitle}</p>
          <dl className="mt-5 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-gold-light">ISSN</dt>
              <dd>{settings.issn}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gold-light">Publisher</dt>
              <dd>{settings.publisher}</dd>
            </div>
          </dl>
        </div>

        <nav aria-label="Footer">
          <h2 className="text-sm font-semibold tracking-widest text-gold-light uppercase">Quick links</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-white/85 no-underline hover:text-white hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold tracking-widest text-gold-light uppercase">Contact</h2>
          <address className="mt-4 space-y-3 text-sm not-italic">
            <p>
              <a
                href={`mailto:${settings.contactEmail}`}
                className="text-white underline decoration-gold/70 hover:decoration-white"
              >
                {settings.contactEmail}
              </a>
            </p>
            <p className="max-w-xs">{settings.postalAddress}</p>
          </address>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-site flex-col gap-2 px-4 py-5 text-xs text-white/70 sm:px-6 md:flex-row md:justify-between lg:px-8">
          <p>
            © <CurrentYear /> {settings.publisher}
          </p>
          <p>ISSN {settings.issn}</p>
        </div>
      </div>
    </footer>
  );
}
