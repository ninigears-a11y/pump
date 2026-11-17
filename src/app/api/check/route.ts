import { NextResponse, type NextRequest } from "next/server";
import { getChecker } from "@/lib/checker";
import { recordCheck } from "@/lib/history";
import { IpRateLimiter } from "@/lib/ipRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const limiter = new IpRateLimiter(Number(process.env.CHECK_RATE_LIMIT_PER_MINUTE) || 120);

function clientKey(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

async function handle(req: NextRequest, input: { username?: unknown; force?: unknown; strict?: unknown }) {
  if (typeof input.username !== "string" || !input.username.trim()) {
    return NextResponse.json({ error: "Missing 'username'." }, { status: 400 });
  }
  if (input.username.length > 200) {
    return NextResponse.json({ error: "'username' is too long." }, { status: 400 });
  }
  const rl = limiter.take(clientKey(req));
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many checks. Slow down and try again shortly.", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const result = await getChecker().check(input.username, {
    force: input.force === true || input.force === "1" || input.force === "true",
    strict: input.strict === true || input.strict === "1" || input.strict === "true",
    signal: req.signal,
  });
  if (!result.cached) recordCheck(result);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
  }
  return handle(req, body as Record<string, unknown>);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return handle(req, {
    username: p.get("username") ?? undefined,
    force: p.get("force") ?? undefined,
    strict: p.get("strict") ?? undefined,
  });
}
