import { NextResponse } from "next/server";
import { historyEnabled } from "@/lib/history";
import { getChecker } from "@/lib/checker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    history: historyEnabled(),
    // Only whether a key is configured — never the key itself.
    verification: getChecker().mode,
    officialApiConfigured: getChecker().mode === "official",
  });
}
