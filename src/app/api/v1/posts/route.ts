import { NextResponse } from "next/server";
import { z } from "zod";
import { listPosts } from "@/lib/queries";
import { isSortKey } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { createPost } from "@/lib/participation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  term: z.string().min(1).max(120),
  title: z.string().min(4).max(160),
  sourceLang: z.string().min(2).max(12),
  targetLang: z.string().min(2).max(12),
  domain: z.string().min(1).max(64),
  context: z.string().min(10).max(8000),
  body: z.string().max(20000).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sortParam = url.searchParams.get("sort") ?? "hot";
  const result = await listPosts({
    query: url.searchParams.get("query") ?? undefined,
    domain: url.searchParams.get("domain") ?? undefined,
    sourceLang: url.searchParams.get("lang") ?? undefined,
    targetLang: url.searchParams.get("targetLang") ?? undefined,
    sort: isSortKey(sortParam) ? sortParam : "hot",
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 12),
  });

  return NextResponse.json({
    ok: true,
    data: result.items,
    total: result.total,
    nextCursor: result.nextCursor,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "参数不合法", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createPost({ user, ...parsed.data });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
}
