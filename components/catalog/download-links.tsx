import { Download } from "lucide-react";
import { formatFileSize } from "@/lib/storage";

interface DownloadOption {
  href: string;
  label: string;
  format: "PDF";
  sizeBytes?: number | null;
}

/** Download buttons. A format with no uploaded file is simply not shown. */
export function DownloadLinks({
  options,
  variant = "compact",
  describedBy,
  secondary = false,
}: {
  options: (DownloadOption | null | false)[];
  variant?: "compact" | "large";
  describedBy?: string;
  /** Outline style only, when a "Read online" button is the main action. */
  secondary?: boolean;
}) {
  const available = options.filter((o): o is DownloadOption => Boolean(o));
  if (available.length === 0) return null;
  return (
    <div className={variant === "large" ? "flex flex-col gap-2.5 sm:flex-row lg:flex-col" : "flex gap-2"}>
      {available.map((option, i) => {
        const size = formatFileSize(option.sizeBytes);
        const primary = variant === "large" && i === 0 && !secondary;
        return (
          <a
            key={option.href}
            href={option.href}
            aria-describedby={describedBy}
            className={
              variant === "large"
                ? `inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 font-medium no-underline transition-colors ${
                    primary
                      ? "bg-navy text-white hover:bg-royal"
                      : "border border-navy text-navy hover:bg-navy hover:text-white"
                  }`
                : "inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-navy no-underline transition-colors hover:border-navy hover:bg-navy hover:text-white"
            }
          >
            <Download aria-hidden className={variant === "large" ? "size-4" : "size-3.5"} />
            <span>{variant === "large" ? option.label : option.format}</span>
            {variant === "large" && size ? <span className="font-normal opacity-80">({size})</span> : null}
          </a>
        );
      })}
    </div>
  );
}
