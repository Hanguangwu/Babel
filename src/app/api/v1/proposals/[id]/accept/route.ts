import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import { acceptProposal } from "@/lib/participation";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  if (!hasRole(user.role, "MODERATOR")) {
    return NextResponse.json({ ok: false, error: "没有采纳权限" }, { status: 403 });
  }

  const { id } = await params;
  const result = await acceptProposal({ user, proposalId: id });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, data: result.data });
}
