import { describe, expect, it } from "vitest";
import { isDecided, manualResult, nextUndecided, notCheckedResult, profileUrlFor } from "@/lib/assisted/manual";
import { verifiedAtOf } from "@/lib/client/api";

const now = new Date("2026-11-17T10:00:00Z");

describe("manualResult", () => {
  it("exists -> TAKEN, manual, never 'verified'", () => {
    const r = manualResult("@MrDev", "exists", now);
    expect(r).toMatchObject({
      username: "mrdev",
      status: "taken",
      method: "manual",
      markedAt: now.toISOString(),
      profileUrl: "https://pump.fun/profile/mrdev",
    });
    expect(r.verifiedAt).toBeUndefined();
    expect(verifiedAtOf(r)).toBeUndefined();
  });

  it("not_found -> AVAILABLE but manual, low confidence, with an honest caveat", () => {
    const r = manualResult("zzfresh", "not_found", now);
    expect(r).toMatchObject({ status: "available", method: "manual", confidence: "low" });
    expect(r.reason).toMatch(/not proof/i);
    expect(verifiedAtOf(r)).toBeUndefined();
  });

  it("unsure -> UNKNOWN with MANUAL_UNSURE", () => {
    const r = manualResult("x", "unsure", now);
    expect(r).toMatchObject({ status: "unknown", method: "none", confidence: "none", diagnostic: { code: "MANUAL_UNSURE" } });
  });

  it("notCheckedResult is UNKNOWN NOT_CHECKED", () => {
    expect(notCheckedResult("x", now)).toMatchObject({ status: "unknown", diagnostic: { code: "NOT_CHECKED" } });
  });

  it("profile URLs use /profile/", () => {
    expect(profileUrlFor("mrdevsol")).toBe("https://pump.fun/profile/mrdevsol");
  });
});

describe("verifiedAtOf", () => {
  it("only automatic results count as verified", () => {
    const base = { checkedAt: "t", verifiedAt: "v" };
    expect(verifiedAtOf({ ...base, status: "taken", method: "official-api" })).toBe("v");
    expect(verifiedAtOf({ ...base, status: "taken", method: "manual" })).toBeUndefined();
    expect(verifiedAtOf({ ...base, status: "unknown", method: "official-api" })).toBeUndefined();
  });
});

describe("review navigation", () => {
  const batch = ["a", "b", "c", "d"];
  it("finds the next undecided name; unknown is not decided", () => {
    const results = { a: { status: "taken" as const }, b: { status: "unknown" as const }, c: { status: "available" as const } };
    expect(nextUndecided(batch, results, 0)).toBe(1);
    expect(nextUndecided(batch, results, 2)).toBe(3);
    expect(nextUndecided(["a", "c"], results, 0)).toBe(-1);
    expect(isDecided(undefined)).toBe(false);
  });
});
