import { ExternalLink } from "lucide-react";
import { AsideCard, StaticPage } from "@/components/pages/static-page";
import { staticPageMetadata } from "@/lib/data/page-metadata";
import { getDepartmentMilestones, getPage } from "@/lib/data/pages";

export const generateMetadata = () => staticPageMetadata("department", "The Department");

export default async function DepartmentPage() {
  const [page, milestones] = await Promise.all([getPage("department"), getDepartmentMilestones()]);

  return (
    <StaticPage
      eyebrow="The Department"
      title="Department of English and Literary Studies"
      lead={<p>University of Nigeria, Nsukka — publisher of AWLEL since 2001.</p>}
      content={page?.content ?? null}
      afterContent={
        milestones.length > 0 ? (
          <section aria-labelledby="timeline-title" className="mt-14 max-w-[70ch]">
            <h2 id="timeline-title" className="border-t border-line pt-5 text-2xl">
              Milestones
            </h2>
            <ol className="relative mt-8 space-y-8 border-l-2 border-gold-light pl-8">
              {milestones.map((m) => (
                <li key={m.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[2.4rem] size-3.5 rounded-full border-2 border-white bg-gold ring-2 ring-gold-light"
                  />
                  <p className="text-sm font-bold tracking-wide text-navy">{m.yearLabel}</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{m.title}</p>
                  {m.description ? <p className="mt-1 font-serif text-ink-muted">{m.description}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null
      }
      aside={
        <AsideCard title="University of Nigeria">
          <p>Visit the university website for the Faculty of Arts and the Department.</p>
          <a
            href="https://www.unn.edu.ng"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 font-semibold"
          >
            unn.edu.ng <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </AsideCard>
      }
    />
  );
}
