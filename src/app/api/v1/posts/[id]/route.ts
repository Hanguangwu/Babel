import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPostDetail } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const detail = await getPostDetail(id, user?.id);
  if (!detail || detail.post.status !== "PUBLISHED") {
    return NextResponse.json({ ok: false, error: "帖子不存在" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      post: detail.post,
      proposals: detail.proposals,
      comments: detail.comments,
      votes: detail.votes,
      userVote: detail.userVote,
      accepted: detail.accepted,
      glossary: detail.glossary,
    },
  });
}
