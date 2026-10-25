import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPostRevisions } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });

  const { id } = await params;
  return NextResponse.json({ ok: true, data: await getPostRevisions(id) });
}
