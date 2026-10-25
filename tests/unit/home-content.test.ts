import { describe, expect, it } from "vitest";
import { HOME_DEFAULTS, homeContentSchema, withHomeDefaults } from "@/lib/home-content";

describe("home page wording", () => {
  it("is the original wording until something is saved", () => {
    expect(withHomeDefaults({})).toEqual(HOME_DEFAULTS);
    expect(withHomeDefaults(null)).toEqual(HOME_DEFAULTS);
  });

  it("keeps saved text and switches, and fills anything missing from the original", () => {
    const home = withHomeDefaults({ hero: { intro: "New introduction." }, cta: { show: false } });
    expect(home.hero.intro).toBe("New introduction.");
    expect(home.hero.readButton).toBe(HOME_DEFAULTS.hero.readButton);
    expect(home.cta.show).toBe(false);
    expect(home.cta.title).toBe(HOME_DEFAULTS.cta.title);
  });

  it("an emptied text goes back to the original, and wrong types are ignored", () => {
    const home = withHomeDefaults({ subjects: { title: "   ", show: "no" }, about: "nonsense" });
    expect(home.subjects.title).toBe(HOME_DEFAULTS.subjects.title);
    expect(home.subjects.show).toBe(true);
    expect(home.about).toEqual(HOME_DEFAULTS.about);
  });

  it("the original wording passes the form's own rules", () => {
    expect(homeContentSchema.safeParse(HOME_DEFAULTS).success).toBe(true);
  });

  it("refuses text that is far too long, with a plain message", () => {
    const r = homeContentSchema.safeParse({
      ...HOME_DEFAULTS,
      hero: { ...HOME_DEFAULTS.hero, readButton: "x".repeat(61) },
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Keep the button text under 60 characters.");
  });
});
