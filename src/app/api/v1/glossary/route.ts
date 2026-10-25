import { NextResponse } from "next/server";
import { listGlossary } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await listGlossary({
    query: url.searchParams.get("query") ?? undefined,
    sourceLang: url.searchParams.get("lang") ?? undefined,
    targetLang: url.searchParams.get("targetLang") ?? undefined,
    domain: url.searchParams.get("domain") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 20),
  });

  return NextResponse.json({
    ok: true,
    data: result.items,
    total: result.total,
    nextCursor: result.nextCursor,
  });
}
