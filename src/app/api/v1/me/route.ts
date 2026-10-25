import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const [posts, proposals, accepted, votes] = await Promise.all([
    prisma.post.count({ where: { authorId: user.id } }),
    prisma.proposal.count({ where: { authorId: user.id } }),
    prisma.proposal.count({ where: { authorId: user.id, status: "ACCEPTED" } }),
    prisma.postVote.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      id: user.id,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      stats: { posts, proposals, accepted, votes },
    },
  });
}
