import { NextResponse, type NextRequest } from "next/server";
import { historyEnabled } from "@/lib/history";
import { getChecker, type ProbeResult } from "@/lib/checker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One live probe per instance per minute at most, so the status panel can't burn API quota.
let lastProbe: { at: number; result: ProbeResult } | undefined;
const PROBE_TTL_MS = 60_000;

/**
 * GET /api/health            -> configuration only (never the key itself)
 * GET /api/health?probe=1    -> also makes one real request to the official API
 */
export async function GET(req: NextRequest) {
  const checker = getChecker();
  const body: Record<string, unknown> = {
    ok: true,
    verification: checker.mode,
    officialApiConfigured: checker.mode === "official",
    history: historyEnabled(),
  };
  if (req.nextUrl.searchParams.get("probe") === "1") {
    if (!lastProbe || Date.now() - lastProbe.at > PROBE_TTL_MS) {
      lastProbe = { at: Date.now(), result: await checker.probe(req.signal) };
    }
    body.probe = { ...lastProbe.result, checkedAt: new Date(lastProbe.at).toISOString() };
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
