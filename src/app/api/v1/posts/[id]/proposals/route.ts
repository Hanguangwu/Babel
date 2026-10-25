import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createProposal } from "@/lib/participation";

export const runtime = "nodejs";

const schema = z.object({
  translation: z.string().min(1).max(200),
  rationale: z.string().min(5).max(5000),
  sourceUrl: z.string().url().max(500).optional().or(z.literal("")),
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
  const result = await createProposal({
    user,
    postId: id,
    translation: parsed.data.translation,
    rationale: parsed.data.rationale,
    sourceUrl: parsed.data.sourceUrl || undefined,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
}
