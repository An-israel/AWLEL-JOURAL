import { describe, expect, it } from "vitest";
import { initialsOf } from "@/lib/initials";

describe("initialsOf", () => {
  it("uses the first and last names", () => {
    expect(initialsOf("Ngozi Adaeze Okeke")).toBe("NO");
    expect(initialsOf("Okeke")).toBe("O");
  });

  it("keeps Yoruba and Igbo initials with dots below", () => {
    expect(initialsOf("Ọlá Ṣóyínká")).toBe("ỌṢ");
    expect(initialsOf("Ẹmeka Ọkafọ")).toBe("ẸỌ");
    // The same letters typed as a base letter plus a combining dot below.
    expect(initialsOf("Ọla Okafo")).toBe("ỌO");
  });

  it("drops titles, with or without full stops, even several of them", () => {
    expect(initialsOf("Prof. T. M. E. Chukwumezie")).toBe("TC");
    expect(initialsOf("Professor Chinua Achebe")).toBe("CA");
    expect(initialsOf("Rev. Fr. Dr. Ifeoma Obi")).toBe("IO");
    expect(initialsOf("Revd Ifeoma Obi")).toBe("IO");
    expect(initialsOf("Engr. Kelechi Nnamdi")).toBe("KN");
    expect(initialsOf("Chief Barr. Ada Eze")).toBe("AE");
    expect(initialsOf("Arc. Tunde Adebayo")).toBe("TA");
    expect(initialsOf("Pharm. (Mrs) Amaka Nwosu")).toBe("AN");
    expect(initialsOf("Sir Wole Soyinka")).toBe("WS");
    expect(initialsOf("Mrs Amaka Nwosu")).toBe("AN");
  });

  it("never drops the only word, even if it looks like a title", () => {
    expect(initialsOf("Chief")).toBe("C");
  });
});
