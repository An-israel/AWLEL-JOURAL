import type { Metadata } from "next";
import Image from "next/image";
import { getEditorialBoard, type BoardMember } from "@/lib/data/pages";

export const metadata: Metadata = {
  title: "Editorial Board",
  description: "The editor, editorial team and editorial consultants of AWLEL.",
  alternates: { canonical: "/editorial-board" },
};

function initialsOf(name: string): string {
  const words = name
    .replace(/^(prof(essor)?|dr|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function Portrait({ member, size }: { member: BoardMember; size: "lg" | "md" }) {
  const box = size === "lg" ? "size-28 sm:size-32" : "size-14";
  if (member.photoUrl) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full bg-paper ring-2 ring-gold-light ${box}`}
      >
        <Image
          src={member.photoUrl}
          alt={`Photograph of ${member.name}`}
          fill
          sizes="128px"
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-navy font-semibold tracking-wide text-gold-light ring-2 ring-gold-light/60 ${box} ${
        size === "lg" ? "text-3xl" : "text-base"
      }`}
    >
      {initialsOf(member.name)}
    </div>
  );
}

export default async function EditorialBoardPage() {
  const groups = await getEditorialBoard();
  const [lead, ...rest] = groups;

  return (
    <>
      <header className="bg-white">
        <div className="mx-auto max-w-site px-4 pt-14 pb-12 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">People</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Editorial Board</h1>
          <hr className="rule-gold mt-6 w-20" />
          <p className="prose-reading mt-6 text-ink-muted">
            AWLEL is edited in the Department of English and Literary Studies, University of Nigeria, Nsukka,
            with the guidance of consultants from universities in Nigeria and abroad.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-site space-y-16 px-4 pt-14 sm:px-6 lg:px-8">
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-white p-10 text-center text-ink-muted">
            The editorial board will be listed here shortly.
          </p>
        ) : null}

        {lead ? (
          <section aria-labelledby={`group-${lead.id}`}>
            <h2
              id={`group-${lead.id}`}
              className="text-xs font-semibold tracking-[0.18em] text-ink-muted uppercase"
            >
              {lead.name}
            </h2>
            <ul className="mt-5 grid gap-6 md:grid-cols-2">
              {lead.members.map((m) => (
                <li
                  key={m.id}
                  className="relative flex flex-col items-start gap-6 overflow-hidden rounded-xl border border-line bg-white p-7 sm:flex-row sm:items-center"
                >
                  <div aria-hidden className="accent-bands absolute inset-x-0 top-0 h-1" />
                  <Portrait member={m} size="lg" />
                  <div>
                    <p className="text-2xl font-bold text-ink">{m.name}</p>
                    {m.title ? <p className="mt-1 font-medium text-coral-ink">{m.title}</p> : null}
                    {m.affiliation ? <p className="mt-2 text-ink-muted">{m.affiliation}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {rest.map((group) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`}>
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <h2 id={`group-${group.id}`} className="text-2xl">
                {group.name}
              </h2>
              <span className="text-sm text-ink-muted">{group.members.length}</span>
            </div>
            <ul className="mt-2 grid gap-x-10 md:grid-cols-2">
              {group.members.map((m) => (
                <li key={m.id} className="flex items-start gap-4 border-b border-line/70 py-5">
                  <Portrait member={m} size="md" />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{m.name}</p>
                    {m.title ? <p className="text-sm font-medium text-coral-ink">{m.title}</p> : null}
                    {m.affiliation ? <p className="mt-0.5 text-sm text-ink-muted">{m.affiliation}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
