import { NextResponse, type NextRequest } from "next/server";
import { clearHistory, historyEnabled, listHistory } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!historyEnabled()) return NextResponse.json({ enabled: false, items: [] });
  const p = req.nextUrl.searchParams;
  const items = listHistory({
    limit: Number(p.get("limit")) || 200,
    username: p.get("username")?.toLowerCase() || undefined,
  });
  return NextResponse.json({ enabled: true, items });
}

export async function DELETE() {
  if (!historyEnabled()) return NextResponse.json({ enabled: false });
  clearHistory();
  return NextResponse.json({ enabled: true, cleared: true });
}
