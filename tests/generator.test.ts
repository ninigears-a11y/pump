import { describe, expect, it } from "vitest";
import { generateUsernames, CATEGORY_LABELS, type GeneratorCategory } from "@/lib/generator";
import { validateUsername } from "@/lib/checker/username";

const ALL = Object.keys(CATEGORY_LABELS) as GeneratorCategory[];

describe("generateUsernames", () => {
  it.each([10, 50, 100, 500, 1000])("generates %i unique valid names", (count) => {
    const list = generateUsernames({ count, categories: ALL, seed: 42 });
    expect(list).toHaveLength(count);
    expect(new Set(list).size).toBe(count);
    expect(list.every((u) => validateUsername(u).valid)).toBe(true);
  });

  it("is deterministic with a seed", () => {
    expect(generateUsernames({ count: 20, categories: ALL, seed: 7 })).toEqual(generateUsernames({ count: 20, categories: ALL, seed: 7 }));
  });

  it("respects categories", () => {
    expect(generateUsernames({ count: 50, categories: ["mr"], seed: 1 }).every((u) => u.startsWith("mr"))).toBe(true);
    expect(generateUsernames({ count: 30, categories: ["the"], seed: 1 }).every((u) => u.startsWith("the"))).toBe(true);
  });

  it("excludes already-checked names", () => {
    const first = generateUsernames({ count: 20, categories: ["mr"], seed: 3 });
    const next = generateUsernames({ count: 20, categories: ["mr"], seed: 3, exclude: first });
    expect(next.some((u) => first.includes(u))).toBe(false);
  });

  it("mixes in a keyword", () => {
    const list = generateUsernames({ count: 40, categories: ["crypto"], keyword: "Nom!", seed: 5 });
    expect(list.some((u) => u.includes("nom"))).toBe(true);
  });
});
