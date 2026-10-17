import Link from "next/link";

export function PreviewBanner({ backHref, status }: { backHref: string; status: string }) {
  return (
    <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold bg-[#FBF3E4] px-4 py-3 text-sm text-[#7A4F18]">
      <span>
        <strong>Preview.</strong> This is how the page will look on the site. Current status: {status}. Downloads are disabled here.
      </span>
      <Link href={backHref} className="font-semibold text-[#7A4F18]">
        ← Back to editing
      </Link>
    </div>
  );
}
