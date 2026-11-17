import { NextResponse } from "next/server";
import { historyEnabled } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    history: historyEnabled(),
    apiBase: process.env.PUMP_API_BASE || "https://frontend-api-v3.pump.fun",
  });
}
