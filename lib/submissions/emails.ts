import type { SubmissionStatus } from "@/lib/submission-status";

/*
 * Wording of the emails authors receive about their submission (item 66).
 * Pure functions, so the text is unit tested; lib/server/notify.ts sends them.
 * Order: greeting, the editors' own message, the decision in plain words,
 * then (after a blank line) where to see details and how to get help.
 */

export const SIGN_OFF =
  "\n\nYours sincerely,\n\nThe Editors, AWLEL\nAfrican, World Literature and English Language";

export interface AuthorEmail {
  subject: string;
  text: string;
}

export function longDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "UTC" });
}

function greeting(name: string): string {
  return `Dear ${name.trim() || "author"},`;
}

function footer(link: string): string {
  return `You can see the full history of your submission, and any comments from the editors, on your submission page:\n${link}\n\nIf you have any questions, simply reply to this email.`;
}

function decision(status: SubmissionStatus, t: string, dueDate: string | null, articleUrl: string | null) {
  switch (status) {
    case "submitted":
      return { subject: `Your manuscript: ${t}`, body: `Your manuscript “${t}” is with the editors.` };
    case "under_screening":
      return {
        subject: `Your manuscript is being screened: ${t}`,
        body: `Your manuscript “${t}” is now being screened by the editors, who check that it fits the journal's scope and follows the submission guidelines. We will write to you again when screening is complete.`,
      };
    case "under_review":
      return {
        subject: `Your manuscript is under review: ${t}`,
        body: `Your manuscript “${t}” has been sent to peer review. Review usually takes several weeks, and we will write to you as soon as the editors have reached a decision.`,
      };
    case "revisions_requested":
      return {
        subject: `Revisions requested: ${t}`,
        body:
          `The editors have considered “${t}” and would like you to revise the manuscript before they make a decision.\n\n` +
          `What to do next:\n` +
          `1. Read the editors' comments above, and any reviewers' comments shared on your submission page.\n` +
          `2. Revise the manuscript, and remove your name from the file and its properties.\n` +
          `3. Upload the revised Word document on your submission page, with a short response to the reviewers explaining the changes you have made.\n\n` +
          (dueDate
            ? `Please send your revised manuscript by ${longDate(dueDate)}. If you need more time, reply to this email and let us know.`
            : `If you need more time than you expected, reply to this email and let us know.`),
      };
    case "revision_received":
      return {
        subject: `Revised manuscript received: ${t}`,
        body: `Thank you for sending the revised version of “${t}”. It is now with the editors, who will be in touch about the next steps.`,
      };
    case "accepted":
      return {
        subject: `Accepted for publication: ${t}`,
        body: `We are delighted to tell you that “${t}” has been accepted for publication in AWLEL. Congratulations. The editors will be in touch about the final files and the issue in which your article will appear.`,
      };
    case "rejected":
      return {
        subject: `Decision on your manuscript: ${t}`,
        body:
          `Thank you for submitting “${t}” to AWLEL, and for the time and care that went into it. After careful consideration, the editors have decided not to accept the manuscript for publication. This decision is final for this manuscript, and we are not able to consider a revised version of it.\n\n` +
          `We know this is disappointing news. We hope that any comments shared with you are helpful as you develop the work further, and we warmly encourage you to submit future work to the journal.`,
      };
    case "published":
      return {
        subject: `Published: ${t}`,
        body:
          `We are pleased to tell you that your article “${t}” has now been published in AWLEL.` +
          (articleUrl ? `\n\nYou can read and share it here:\n${articleUrl}` : "") +
          `\n\nThank you for choosing to publish with us. We hope you will consider AWLEL for your future work.`,
      };
    case "withdrawn":
      return {
        subject: `Manuscript withdrawn: ${t}`,
        body: `Your manuscript “${t}” has been withdrawn and is no longer under consideration. Thank you for your interest in AWLEL; we would be glad to receive future work from you.`,
      };
  }
}

/** The email an author receives when their submission's status changes. */
export function statusEmail(s: {
  status: SubmissionStatus;
  title: string;
  authorName: string;
  message: string | null;
  link: string;
  revisionDueDate?: string | null;
  articleUrl?: string | null;
}): AuthorEmail {
  const d = decision(s.status, s.title, s.revisionDueDate ?? null, s.articleUrl ?? null);
  const message = s.message?.trim();
  const parts = [greeting(s.authorName), ...(message ? [message] : []), d.body, footer(s.link)];
  return { subject: d.subject, text: parts.join("\n\n") + SIGN_OFF };
}

/** A note from the editors without a change of status (item 55). */
export function noteEmail(s: {
  title: string;
  authorName: string;
  message: string;
  link: string;
}): AuthorEmail {
  return {
    subject: `A note from the editors: ${s.title}`,
    text:
      [
        greeting(s.authorName),
        `The editors have added a note about your manuscript “${s.title}”:`,
        s.message.trim(),
        footer(s.link),
      ].join("\n\n") + SIGN_OFF,
  };
}

/** The revision is overdue (item 54): sent at most once a week. */
export function revisionReminderEmail(s: {
  title: string;
  authorName: string;
  dueDate: string;
  link: string;
}): AuthorEmail {
  return {
    subject: `Revised manuscript overdue: ${s.title}`,
    text:
      [
        greeting(s.authorName),
        `This is a gentle reminder that the revised version of “${s.title}” was due on ${longDate(s.dueDate)}. If you are still working on it, or need more time, simply reply to this email and let the editors know. If you no longer wish to continue, you can withdraw the manuscript from your submission page.`,
        `When it is ready, upload the revised Word document and your response to the reviewers here:\n${s.link}`,
      ].join("\n\n") + SIGN_OFF,
  };
}
