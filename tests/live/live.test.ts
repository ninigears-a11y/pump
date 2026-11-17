/**
 * Opt-in live smoke test against the real Pump.fun endpoints.
 *   LIVE=1 LIVE_USERNAMES=mrnom,someothername npm run test:live
 * It asserts only engine invariants (never available without clean evidence),
 * because live outcomes depend on Pump.fun data and your network/IP.
 */
import { describe, expect, it } from "vitest";
import { UsernameChecker } from "@/lib/checker";

const LIVE = process.env.LIVE === "1";
const names = (process.env.LIVE_USERNAMES ?? "mrnom,zzqxq_not_a_user_7731").split(",").map((s) => s.trim()).filter(Boolean);

describe.skipIf(!LIVE)("live Pump.fun check", () => {
  const checker = new UsernameChecker({ cache: null });
  for (const name of names) {
    it(`checks ${name}`, { timeout: 60_000 }, async () => {
      const r = await checker.check(name, { force: true });
      console.log(JSON.stringify(r, null, 2));
      expect(["available", "taken", "unknown"]).toContain(r.status);
      if (r.status === "available") {
        const api = r.evidence.filter((e) => e.source.startsWith("pump-frontend-api"));
        expect(api.every((e) => e.outcome === "not_found")).toBe(true);
        expect(api.length).toBe(2);
      }
    });
  }
});
