import { describe, expect, it } from "vitest";
import { suggestVariations } from "@/lib/suggestions";
import { validateUsername } from "@/lib/checker/username";

describe("suggestVariations", () => {
  it("includes the classic variations", () => {
    const s = suggestVariations("mrdev", 50);
    for (const v of ["realmrdev", "itsmrdev", "themrdev", "mrdevsol", "mrdevx", "mrdev_"]) expect(s).toContain(v);
  });

  it("excludes the original, duplicates and invalid names", () => {
    const s = suggestVariations("MrDev", 50);
    expect(s).not.toContain("mrdev");
    expect(new Set(s).size).toBe(s.length);
    expect(s.every((u) => validateUsername(u).valid)).toBe(true);
  });

  it("respects the limit and empty input", () => {
    expect(suggestVariations("mrdev", 5)).toHaveLength(5);
    expect(suggestVariations("")).toEqual([]);
  });
});
