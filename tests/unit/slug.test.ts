import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/admin/slug";

describe("slugify", () => {
  it("makes clean, readable slugs", () => {
    expect(slugify("Code-Switching and Identity in Igbo–English Conversations")).toBe(
      "code-switching-and-identity-in-igbo-english-conversations",
    );
    expect(slugify("Chinua Achebe's “Things Fall Apart” & After")).toBe(
      "chinua-achebe-s-things-fall-apart-and-after",
    );
    expect(slugify("Ọ̀rọ̀ àti Ìtàn")).toBe("oro-ati-itan");
  });
  it("caps the length without a trailing hyphen", () => {
    const slug = slugify("word ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});
