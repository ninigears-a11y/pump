/**
 * Opt-in LIVE test against the real Pump.fun Developer API.
 *
 *   LIVE=1 PUMP_API_KEY=pf_live_... npm run test:live      # real verification
 *   LIVE=1 npm run test:live                                # verifies the real error path
 *
 * With a working key every name must come back AVAILABLE or TAKEN (never UNKNOWN).
 */
import { describe, expect, it } from "vitest";
import { checkerFromEnv } from "@/lib/checker";

const LIVE = process.env.LIVE === "1";
const KEY = process.env.PUMP_API_KEY?.trim();
const names = (process.env.LIVE_USERNAMES ?? "nom,neo,zen,vex,zzq_unclaimed_7731").split(",").map((s) => s.trim()).filter(Boolean);

describe.skipIf(!LIVE)("live: official Pump.fun API", () => {
  if (KEY) {
    const checker = checkerFromEnv({ ...process.env, PUMP_UNOFFICIAL_FALLBACK: "0" });
    it("probe succeeds with the configured key", { timeout: 30_000 }, async () => {
      const p = await checker.probe();
      console.log("probe", JSON.stringify(p));
      expect(p.ok).toBe(true);
    });
    for (const name of names) {
      it(`verifies ${name}`, { timeout: 30_000 }, async () => {
        const r = await checker.check(name, { force: true });
        console.log(name, r.status, r.method, r.diagnostic?.code ?? "", r.reason);
        expect(["available", "taken"]).toContain(r.status);
        expect(r.method).toBe("official-api");
        expect(r.verifiedAt).toBeDefined();
      });
    }
  } else {
    it("without a key: no request is made, OFFICIAL_API_KEY_MISSING", async () => {
      const r = await checkerFromEnv({}).check("nom");
      console.log("no-key", r.status, r.diagnostic?.code);
      expect(r.diagnostic?.code).toBe("OFFICIAL_API_KEY_MISSING");
    });
    it("real request with an invalid key: UNKNOWN API_KEY_INVALID (never available/taken)", { timeout: 30_000 }, async () => {
      const fake = `pf_live_${"A".repeat(43)}${"B".repeat(6)}`;
      const r = await checkerFromEnv({ PUMP_API_KEY: fake }).check("nom", { force: true });
      console.log("invalid-key", r.status, r.diagnostic?.code, r.diagnostic?.httpStatus, r.diagnostic?.requestId);
      expect(r.status).toBe("unknown");
      expect(r.diagnostic?.code).toBe("API_KEY_INVALID");
      expect(r.diagnostic?.requestId).toBeTruthy();
    });
  }
});
