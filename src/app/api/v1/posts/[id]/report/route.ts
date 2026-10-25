import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { reportContent } from "@/lib/participation";

export const runtime = "nodejs";

const schema = z.object({
  reason: z.string().min(1).max(80),
  detail: z.string().max(2000).optional(),
  commentId: z.string().max(64).optional(),
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
  const result = await reportContent({
    user,
    postId: id,
    reason: parsed.data.reason,
    detail: parsed.data.detail ?? null,
    commentId: parsed.data.commentId ?? null,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
}
