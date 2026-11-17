import { NextResponse, type NextRequest } from "next/server";
import { labLookup, LAB_INTERVAL_MS } from "@/lib/lab/internalApi";
import { normalizeUsername, validateUsername } from "@/lib/checker/username";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LAB ONLY. Server-side variant of the experiment (shows what Vercel's IPs receive).
// Process-wide throttle: one upstream request at a time, >= LAB_INTERVAL_MS apart.
let next = 0;
let chain: Promise<unknown> = Promise.resolve();

export async function GET(req: NextRequest) {
  const u = normalizeUsername(req.nextUrl.searchParams.get("username") ?? "");
  if (!validateUsername(u).valid) return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  const run = chain.then(async () => {
    const wait = next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    next = Date.now() + LAB_INTERVAL_MS;
    return labLookup(u, "server");
  });
  chain = run.catch(() => undefined);
  return NextResponse.json(await run, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
