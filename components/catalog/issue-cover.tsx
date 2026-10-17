import Image from "next/image";
import { MONTHS } from "@/lib/issue-label";
import type { IssueSummary } from "@/lib/data/catalog";

/**
 * An issue's cover. Uses the uploaded image when there is one; otherwise a
 * typographic cover in the house style (navy field, diagonal bands), so the
 * archive never shows an empty box.
 */
export function IssueCover({
  issue,
  sizes,
  priority = false,
  className = "",
}: {
  issue: IssueSummary;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const frame = `relative aspect-[210/297] overflow-hidden rounded-[3px] bg-navy shadow-[0_1px_2px_rgba(0,0,0,0.12),0_12px_28px_-12px_rgba(17,17,17,0.45)] ${className}`;

  if (issue.coverUrl) {
    return (
      <div className={frame}>
        <Image
          src={issue.coverUrl}
          alt={issue.coverAlt ?? `Cover of AWLEL ${issue.label}`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }

  const when = issue.month ? `${MONTHS[issue.month - 1]} ${issue.year}` : String(issue.year);
  return (
    <div className={`${frame} @container text-white`} role="img" aria-label={`Cover of AWLEL ${issue.label}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-navy to-navy-deep" />
      <div
        className="absolute inset-x-0 bottom-0 h-[42%]"
        style={{ clipPath: "polygon(0 38%, 100% 0, 100% 100%, 0 100%)" }}
        aria-hidden
      >
        <div className="cover-bands h-full w-full" />
      </div>
      <div className="relative flex h-full flex-col p-[8cqw]">
        <span className="font-bold tracking-tight" style={{ fontSize: "17cqw", lineHeight: 0.95 }}>
          AWLEL
        </span>
        <span
          className="mt-[2.5cqw] self-start rounded-[1cqw] bg-coral px-[2cqw] py-[0.8cqw] font-bold tracking-[0.2em] uppercase"
          style={{ fontSize: "4.2cqw" }}
        >
          Journal
        </span>
        <span className="mt-[4cqw] text-white/80" style={{ fontSize: "4cqw", lineHeight: 1.35 }}>
          African, World Literature and English Language
        </span>
        <span className="mt-auto mb-[30cqw] font-semibold" style={{ fontSize: "8cqw", lineHeight: 1.1 }}>
          Volume {issue.volumeNumber}
          {issue.issuesInVolume > 1 ? (
            <span className="block font-medium text-gold-light" style={{ fontSize: "6cqw" }}>
              Issue {issue.issueNumber}
            </span>
          ) : null}
          <span className="block font-normal text-white/80" style={{ fontSize: "4.5cqw" }}>
            {when}
          </span>
        </span>
      </div>
    </div>
  );
}
