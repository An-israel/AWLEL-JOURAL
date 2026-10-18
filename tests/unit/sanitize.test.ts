import { describe, expect, it } from "vitest";
import { hasPlaceholder, richTextToPlain, stripPlaceholders } from "@/lib/sanitize";

describe("richTextToPlain", () => {
  it("keeps a space between paragraphs, list items and line breaks", () => {
    expect(richTextToPlain("<p>Achebe and O'Brien</p><p>Next paragraph</p>")).toBe(
      "Achebe and O'Brien Next paragraph",
    );
    expect(richTextToPlain("<ul><li>One</li><li>Two</li></ul>")).toBe("One Two");
    expect(richTextToPlain("Line one<br>Line two<br/>Line three")).toBe("Line one Line two Line three");
    expect(richTextToPlain("<h2>Aims</h2><p>To publish</p>")).toBe("Aims To publish");
  });

  it("does not add spaces inside inline formatting", () => {
    expect(richTextToPlain("<p>Things <em>Fall</em> Apart, <strong>un</strong>bold</p>")).toBe(
      "Things Fall Apart, unbold",
    );
  });

  it("decodes entities and collapses whitespace", () => {
    expect(richTextToPlain("<p>Language&nbsp;&amp; Literature &lt;3</p>")).toBe("Language & Literature <3");
    expect(richTextToPlain(null)).toBe("");
  });
});

describe("hasPlaceholder", () => {
  it("spots bracketed placeholders in short fields", () => {
    expect(hasPlaceholder("[Year]")).toBe(true);
    expect(hasPlaceholder("[Placeholder] Department founded")).toBe(true);
    expect(hasPlaceholder("[To be confirmed]")).toBe(true);
    expect(hasPlaceholder("2001")).toBe(false);
    expect(hasPlaceholder("AWL founded [1]")).toBe(false);
    expect(hasPlaceholder(null)).toBe(false);
  });
});

describe("stripPlaceholders", () => {
  it("leaves pages without placeholders untouched (apart from sanitising)", () => {
    const html = "<h2>Aims</h2><p>To publish <mark>important</mark> work.</p>";
    expect(stripPlaceholders(html)).toBe(html);
    expect(stripPlaceholders('<p onclick="x">Hi</p><script>alert(1)</script>')).toBe("<p>Hi</p>");
  });

  it("removes a placeholder at the end of a sentence and keeps the sentence", () => {
    expect(
      stripPlaceholders(
        "<p>AWLEL accepts original research articles. <mark>[To be confirmed: whether the journal also accepts review essays.]</mark></p>",
      ),
    ).toBe("<p>AWLEL accepts original research articles.</p>");
  });

  it("removes list items left as a bare label, and the list when nothing is left", () => {
    const html = `<h2>Formatting</h2>
<ul>
<li>Prepare the manuscript in an <strong>indented paragraphing style</strong>.</li>
<li>Length: <mark>[To be confirmed: word count limits.]</mark></li>
<li>Font and spacing: <mark>[To be confirmed: font, size and line spacing.]</mark></li>
</ul>`;
    const out = stripPlaceholders(html);
    expect(out).toContain("indented paragraphing style");
    expect(out).not.toContain("Length");
    expect(out).not.toContain("Font and spacing");
    expect(out).not.toContain("To be confirmed");
    expect(out.match(/<li>/g)).toHaveLength(1);

    expect(stripPlaceholders("<p>Intro.</p><ul><li><mark>[Placeholder: x]</mark></li></ul>")).toBe(
      "<p>Intro.</p>",
    );
  });

  it("drops a heading whose whole section was placeholders", () => {
    const html = `<h2>ISSN</h2>
<p>2315-5493</p>
<h2>Publication frequency</h2>
<p><mark>[To be confirmed: publication frequency.]</mark></p>
<h2>Peer review policy</h2>
<p>All research articles undergo double-blind peer review. <mark>[To be confirmed by the Editor.]</mark></p>
<h2>Indexing</h2>
<p><mark>[To be confirmed: databases and indexes in which AWLEL is listed.]</mark></p>`;
    const out = stripPlaceholders(html);
    expect(out).toContain("<h2>ISSN</h2>");
    expect(out).toContain("<h2>Peer review policy</h2>");
    expect(out).toContain("double-blind peer review.</p>");
    expect(out).not.toContain("Publication frequency");
    expect(out).not.toContain("Indexing");
    expect(out).not.toContain("<mark>");
  });

  it("drops a parent heading once its sub-sections are all gone", () => {
    const html =
      "<p>Kept.</p><h2>Policies</h2><h3>Fees</h3><p><mark>[Placeholder: fees]</mark></p><h3>Ethics</h3><p><mark>[TBC]</mark></p><h2>Next</h2><p>Text.</p>";
    expect(stripPlaceholders(html)).toBe("<p>Kept.</p><h2>Next</h2><p>Text.</p>");
  });

  it("keeps a section that still has an image", () => {
    const html =
      '<h2>Photos</h2><figure><img src="https://example.com/a.jpg" alt="Staff" /></figure><p><mark>[Placeholder: caption]</mark></p>';
    expect(stripPlaceholders(html)).toContain("<h2>Photos</h2>");
  });

  it("returns an empty string when the whole page is a placeholder", () => {
    expect(stripPlaceholders("<p><mark>[Placeholder: privacy policy.]</mark></p>")).toBe("");
  });

  it("keeps a real paragraph that ends with a colon", () => {
    const html =
      "<p>Every manuscript must be organised under the following headings:</p><ol><li>Abstract</li></ol>";
    expect(stripPlaceholders(`${html}<p><mark>[Placeholder: x]</mark></p>`)).toBe(html);
  });
});
