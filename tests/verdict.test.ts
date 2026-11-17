import { describe, expect, it } from "vitest";
import { decideVerdict } from "@/lib/checker/verdict";
import type { Evidence, EvidenceOutcome } from "@/lib/checker/types";

const api = (outcome: EvidenceOutcome): Evidence => ({ source: "pump-frontend-api", outcome, detail: outcome });
const page = (outcome: EvidenceOutcome): Evidence => ({ source: "pump-profile-page", outcome, detail: outcome });
const ALL: EvidenceOutcome[] = ["found", "not_found", "blocked", "rate_limited", "error", "ambiguous", "skipped"];

describe("decideVerdict", () => {
  it("taken when API finds the user", () => {
    expect(decideVerdict({ api: api("found"), strict: false })).toMatchObject({ status: "taken", confidence: "high" });
  });

  it("taken when only the page finds the user", () => {
    expect(decideVerdict({ api: api("blocked"), page: page("found"), strict: false }).status).toBe("taken");
  });

  it("taken (safe) when sources disagree", () => {
    expect(decideVerdict({ api: api("not_found"), apiConfirm: api("not_found"), page: page("found"), strict: false })).toMatchObject({
      status: "taken",
      confidence: "medium",
    });
  });

  it("available/high when API x2 and page agree", () => {
    expect(decideVerdict({ api: api("not_found"), apiConfirm: api("not_found"), page: page("not_found"), strict: true })).toMatchObject({
      status: "available",
      confidence: "high",
    });
  });

  it("available/medium when API x2 agree and page is inconclusive (non-strict)", () => {
    expect(decideVerdict({ api: api("not_found"), apiConfirm: api("not_found"), page: page("blocked"), strict: false })).toMatchObject({
      status: "available",
      confidence: "medium",
    });
  });

  it("unknown in strict mode when page cannot confirm", () => {
    expect(decideVerdict({ api: api("not_found"), apiConfirm: api("not_found"), page: page("blocked"), strict: true }).status).toBe("unknown");
  });

  it("unknown when the confirmation request fails", () => {
    expect(decideVerdict({ api: api("not_found"), apiConfirm: api("rate_limited"), strict: false }).status).toBe("unknown");
  });

  it("unknown without a confirmation request", () => {
    expect(decideVerdict({ api: api("not_found"), strict: false }).status).toBe("unknown");
  });

  it("page not_found alone is never enough", () => {
    for (const o of ["blocked", "rate_limited", "error", "ambiguous"] as const) {
      expect(decideVerdict({ api: api(o), page: page("not_found"), strict: false }).status).toBe("unknown");
    }
  });

  it("exhaustive: available ONLY with two API not_found and no found anywhere", () => {
    for (const a of ALL)
      for (const c of [...ALL, undefined])
        for (const p of [...ALL, undefined])
          for (const strict of [true, false]) {
            const v = decideVerdict({ api: api(a), apiConfirm: c && api(c), page: p && page(p), strict });
            if (v.status === "available") {
              expect(a).toBe("not_found");
              expect(c).toBe("not_found");
              expect(p).not.toBe("found");
              if (strict) expect(p).toBe("not_found");
            }
          }
  });
});
