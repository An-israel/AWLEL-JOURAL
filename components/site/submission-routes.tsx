import { Mail, MonitorUp } from "lucide-react";
import Link from "next/link";

/**
 * The two ways to submit a manuscript, side by side: online (an author
 * account, the form, and progress tracking) or by email to the editorial
 * office. Shown on the Submit page and in the Submission Guidelines.
 */
export function SubmissionRoutes({
  email,
  signedIn,
  formAnchor,
}: {
  email: string;
  /** Unknown on static pages: "Submit online" then opens the Submit page, which asks to sign in. */
  signedIn?: boolean;
  /** When the form is on the same page, "Submit online" jumps to it. */
  formAnchor?: string;
}) {
  const subject = encodeURIComponent("Manuscript submission: [title of your manuscript]");
  return (
    <section aria-labelledby="ways-title">
      <h2 id="ways-title" className="text-2xl">
        Two ways to submit
      </h2>
      <p className="mt-2 text-ink-muted">Choose whichever suits you; both reach the same editors.</p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col rounded-xl border-l-4 border-navy bg-[#EDF1F9] p-6">
          <MonitorUp aria-hidden className="size-7 text-navy" />
          <h3 className="mt-3 text-lg font-semibold">1. Submit online</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Fill in a short form and upload your manuscript as a Word document. You get a receipt at once and
            can follow your manuscript through screening, review and decision from your account.
          </p>
          <div className="mt-auto flex flex-wrap gap-3 pt-5">
            {signedIn === undefined ? (
              <Link
                href="/submit"
                className="rounded-md bg-navy px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-royal"
              >
                Submit online
              </Link>
            ) : signedIn ? (
              <a
                href={formAnchor ?? "/submit"}
                className="rounded-md bg-navy px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-royal"
              >
                Go to the submission form
              </a>
            ) : (
              <>
                <Link
                  href="/login?next=%2Fsubmit"
                  className="rounded-md bg-navy px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-royal"
                >
                  Sign in to submit
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md border border-navy px-4 py-2.5 text-sm font-medium text-navy no-underline hover:bg-navy hover:text-white"
                >
                  Create a free author account
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-xl border-l-4 border-gold bg-[#FBF5E9] p-6">
          <Mail aria-hidden className="size-7 text-gold-dark" />
          <h3 className="mt-3 text-lg font-semibold">2. Submit by email</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Send your manuscript as a Word document (.docx) to:
          </p>
          <p className="mt-2 text-lg font-semibold break-all text-ink select-all">{email}</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            In your email, give the title of the manuscript, your full name and institution, your phone
            number, and the names of any co-authors.
          </p>
          <div className="mt-auto pt-5">
            <a
              href={`mailto:${email}?subject=${subject}`}
              className="inline-block rounded-md border border-gold-dark px-4 py-2.5 text-sm font-medium text-gold-dark no-underline hover:bg-gold-dark hover:text-white"
            >
              Write the email
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
