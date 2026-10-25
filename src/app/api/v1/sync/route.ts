import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { reconcile } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(token: string | null, userRole: string | null): boolean {
  const expected = process.env.SYNC_TOKEN;
  if (expected && token && token === expected) return true;
  return !!userRole && hasRole(userRole, "MODERATOR");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const token = request.headers.get("x-sync-token");
  if (!authorized(token, user?.role ?? null)) {
    return NextResponse.json({ ok: false, error: "没有同步权限" }, { status: 403 });
  }

  const report = await reconcile();
  return NextResponse.json({ ok: true, data: report });
}
