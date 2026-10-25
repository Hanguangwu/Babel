import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { castProposalVote } from "@/lib/participation";

export const runtime = "nodejs";

const schema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "value 必须是 1 或 -1" }, { status: 400 });
  }

  const { id } = await params;
  const result = await castProposalVote({
    userId: user.id,
    proposalId: id,
    value: parsed.data.value,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, data: result.data });
}
