import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createComment } from "@/lib/participation";

export const runtime = "nodejs";

const schema = z.object({
  body: z.string().min(1).max(5000),
  parentId: z.string().max(64).optional().nullable(),
  proposalId: z.string().max(64).optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "参数不合法" }, { status: 400 });
  }

  const { id } = await params;
  const result = await createComment({
    user,
    postId: id,
    body: parsed.data.body,
    parentId: parsed.data.parentId ?? null,
    proposalId: parsed.data.proposalId ?? null,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
}
