import "server-only";

import type { Post } from "@prisma/client";
import { prisma } from "./db";
import {
  COMMENT_STATUS,
  DOMAINS,
  LANGUAGES,
  POST_STATUS,
  REPORT_STATUS,
  hasRole,
  isDomainSlug,
  isLanguageCode,
} from "./constants";
import { computeHotScore } from "./ranking";
import { enqueueGitHubJob } from "./ingest";
import { slugifyTerm } from "./glossary";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string };

export type SessionUser = {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
};

const MAX_CONTEXT = 8000;
const MAX_BODY = 20_000;
const MAX_COMMENT = 5000;
const MAX_RATIONALE = 5000;

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/* -------------------------------------------------------------------------- */
/* Votes                                                                      */
/* -------------------------------------------------------------------------- */

export async function castPostVote(input: {
  userId: string;
  postId: string;
  value: 1 | -1;
}): Promise<ActionResult<{ score: number; upvotes: number; downvotes: number; userVote: number }>> {
  if (input.value !== 1 && input.value !== -1) return fail("非法的投票值");

  const post = await prisma.post.findUnique({
    where: { id: input.postId },
    select: {
      id: true,
      status: true,
      lastActivityAt: true,
    },
  });
  if (!post) return fail("帖子不存在");
  if (post.status !== POST_STATUS.PUBLISHED) return fail("该帖子当前不可投票");

  const counts = await prisma.$transaction(async (tx) => {
    const existing = await tx.postVote.findUnique({
      where: { postId_userId: { postId: post.id, userId: input.userId } },
    });

    let userVote = 0;
    if (!existing) {
      await tx.postVote.create({
        data: { postId: post.id, userId: input.userId, value: input.value },
      });
      userVote = input.value;
    } else if (existing.value === input.value) {
      await tx.postVote.delete({ where: { id: existing.id } });
      userVote = 0;
    } else {
      await tx.postVote.update({ where: { id: existing.id }, data: { value: input.value } });
      userVote = input.value;
    }

    const grouped = await tx.postVote.groupBy({
      by: ["value"],
      where: { postId: post.id },
      _count: { _all: true },
    });
    const upvotes = grouped.find((row) => row.value === 1)?._count._all ?? 0;
    const downvotes = grouped.find((row) => row.value === -1)?._count._all ?? 0;

    const updated = await tx.post.update({
      where: { id: post.id },
      data: {
        upvotes,
        downvotes,
        score: upvotes - downvotes,
        hotScore: computeHotScore({
          upvotes,
          downvotes,
          lastActivityAt: post.lastActivityAt,
        }),
      },
      select: { score: true, upvotes: true, downvotes: true },
    });

    return { ...updated, userVote };
  });

  return { ok: true, data: counts };
}

export async function castProposalVote(input: {
  userId: string;
  proposalId: string;
  value: 1 | -1;
}): Promise<ActionResult<{ score: number; upvotes: number; downvotes: number; userVote: number }>> {
  if (input.value !== 1 && input.value !== -1) return fail("非法的投票值");

  const proposal = await prisma.proposal.findUnique({
    where: { id: input.proposalId },
    include: { post: { select: { status: true } } },
  });
  if (!proposal) return fail("译法建议不存在");
  if (proposal.post.status !== POST_STATUS.PUBLISHED) return fail("该帖子当前不可投票");

  const counts = await prisma.$transaction(async (tx) => {
    const existing = await tx.proposalVote.findUnique({
      where: {
        proposalId_userId: { proposalId: proposal.id, userId: input.userId },
      },
    });

    let userVote = 0;
    if (!existing) {
      await tx.proposalVote.create({
        data: { proposalId: proposal.id, userId: input.userId, value: input.value },
      });
      userVote = input.value;
    } else if (existing.value === input.value) {
      await tx.proposalVote.delete({ where: { id: existing.id } });
      userVote = 0;
    } else {
      await tx.proposalVote.update({ where: { id: existing.id }, data: { value: input.value } });
      userVote = input.value;
    }

    const grouped = await tx.proposalVote.groupBy({
      by: ["value"],
      where: { proposalId: proposal.id },
      _count: { _all: true },
    });
    const upvotes = grouped.find((row) => row.value === 1)?._count._all ?? 0;
    const downvotes = grouped.find((row) => row.value === -1)?._count._all ?? 0;

    const updated = await tx.proposal.update({
      where: { id: proposal.id },
      data: { upvotes, downvotes, score: upvotes - downvotes },
      select: { score: true, upvotes: true, downvotes: true },
    });

    return { ...updated, userVote };
  });

  return { ok: true, data: counts };
}

/* -------------------------------------------------------------------------- */
/* Posts                                                                      */
/* -------------------------------------------------------------------------- */

export async function createPost(input: {
  user: SessionUser;
  term: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  domain: string;
  context: string;
  body?: string;
}): Promise<ActionResult<{ postId: string; status: string }>> {
  const term = input.term.trim();
  const title = input.title.trim();
  const context = input.context.trim();
  const body = (input.body ?? "").trim();

  if (term.length < 1 || term.length > 120) return fail("术语长度需在 1–120 字之间");
  if (title.length < 4 || title.length > 160) return fail("标题长度需在 4–160 字之间");
  if (!isLanguageCode(input.sourceLang) || !isLanguageCode(input.targetLang)) {
    return fail("请选择有效的语言对");
  }
  if (input.sourceLang === input.targetLang) return fail("源语言与目标语言不能相同");
  if (!isDomainSlug(input.domain)) return fail("请选择有效的领域");
  if (context.length < 10 || context.length > MAX_CONTEXT) {
    return fail(`语境说明需在 10–${MAX_CONTEXT} 字之间`);
  }
  if (body.length > MAX_BODY) return fail(`补充说明不能超过 ${MAX_BODY} 字`);

  const recent = await prisma.post.count({
    where: {
      authorId: input.user.id,
      createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
    },
  });
  if (recent >= 5) return fail("发帖过于频繁，请稍后再试");

  const trusted = hasRole(input.user.role, "CONTRIBUTOR");
  const status = trusted ? POST_STATUS.PUBLISHED : POST_STATUS.PENDING_REVIEW;
  const now = new Date();

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        term,
        title,
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        domain: input.domain,
        contextMarkdown: context,
        bodyMarkdown: body,
        status,
        authorId: input.user.id,
        authorLogin: input.user.login,
        publishedAt: trusted ? now : null,
        lastActivityAt: now,
        hotScore: 0,
        revisions: {
          create: {
            bodyMarkdown: [context, body].filter(Boolean).join("\n\n"),
            source: "SITE",
            authorId: input.user.id,
            authorLogin: input.user.login,
          },
        },
      },
      select: { id: true, status: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.user.id,
        actorLogin: input.user.login,
        action: "post.created",
        targetType: "post",
        targetId: created.id,
        detailJson: JSON.stringify({
          term,
          sourceLang: input.sourceLang,
          targetLang: input.targetLang,
          domain: input.domain,
          status,
        }),
      },
    });

    return created;
  });

  await enqueueGitHubJob({
    kind: "ISSUE_CREATE",
    postId: post.id,
    idempotencyKey: `issue:${post.id}`,
  });

  return { ok: true, data: { postId: post.id, status: post.status } };
}

/* -------------------------------------------------------------------------- */
/* Proposals                                                                  */
/* -------------------------------------------------------------------------- */

export async function createProposal(input: {
  user: SessionUser;
  postId: string;
  translation: string;
  rationale: string;
  sourceUrl?: string;
}): Promise<ActionResult<{ proposalId: string }>> {
  const translation = input.translation.trim();
  const rationale = input.rationale.trim();
  if (translation.length < 1 || translation.length > 200) {
    return fail("译法长度需在 1–200 字之间");
  }
  if (rationale.length < 5 || rationale.length > MAX_RATIONALE) {
    return fail(`理由需在 5–${MAX_RATIONALE} 字之间`);
  }

  const post = await prisma.post.findUnique({
    where: { id: input.postId },
    select: { id: true, status: true, resolution: true, upvotes: true, downvotes: true },
  });
  if (!post) return fail("帖子不存在");
  if (post.status !== POST_STATUS.PUBLISHED) return fail("该帖子当前不接受译法建议");

  const duplicate = await prisma.proposal.findUnique({
    where: { postId_translation: { postId: post.id, translation } },
  });
  if (duplicate) return fail("这个译法已经被提过了，可以直接投票或补充理由");

  const recent = await prisma.proposal.count({
    where: {
      authorId: input.user.id,
      createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
    },
  });
  if (recent >= 5) return fail("提交译法过于频繁，请稍后再试");

  const proposal = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        postId: post.id,
        authorId: input.user.id,
        authorLogin: input.user.login,
        authorName: input.user.name,
        authorAvatarUrl: input.user.avatarUrl,
        translation,
        rationaleMarkdown: rationale,
        sourceUrl: input.sourceUrl?.trim() || null,
      },
      select: { id: true },
    });

    const now = new Date();
    await tx.post.update({
      where: { id: post.id },
      data: {
        proposalCount: { increment: 1 },
        lastActivityAt: now,
        hotScore: computeHotScore({
          upvotes: post.upvotes,
          downvotes: post.downvotes,
          lastActivityAt: now,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.user.id,
        actorLogin: input.user.login,
        action: "proposal.created",
        targetType: "proposal",
        targetId: created.id,
        detailJson: JSON.stringify({ postId: post.id, translation }),
      },
    });

    return created;
  });

  await enqueueGitHubJob({
    kind: "PROPOSAL_CREATE",
    postId: post.id,
    proposalId: proposal.id,
    idempotencyKey: `proposal-comment:${proposal.id}`,
  });

  return { ok: true, data: { proposalId: proposal.id } };
}

export async function acceptProposal(input: {
  user: SessionUser;
  proposalId: string;
}): Promise<ActionResult<{ postId: string }>> {
  if (!hasRole(input.user.role, "MODERATOR")) return fail("只有版主可以采纳译法");

  const proposal = await prisma.proposal.findUnique({
    where: { id: input.proposalId },
    include: { post: true },
  });
  if (!proposal) return fail("译法建议不存在");
  if (proposal.status === "ACCEPTED") return fail("该译法已经被采纳");
  if (proposal.post.status !== POST_STATUS.PUBLISHED) {
    return fail("帖子尚未发布，不能采纳译法");
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposal.id },
      data: { status: "ACCEPTED" },
    });
    await tx.proposal.updateMany({
      where: { postId: proposal.postId, id: { not: proposal.id }, status: "PROPOSED" },
      data: { status: "SUPERSEDED" },
    });
    await tx.post.update({
      where: { id: proposal.postId },
      data: { resolution: "RESOLVED", lastActivityAt: new Date() },
    });

    const slug = slugifyTerm(proposal.post.term);
    await tx.glossaryEntry.upsert({
      where: { postId: proposal.postId },
      create: {
        slug,
        term: proposal.post.term,
        translation: proposal.translation,
        sourceLang: proposal.post.sourceLang,
        targetLang: proposal.post.targetLang,
        domain: proposal.post.domain,
        rationaleMarkdown: proposal.rationaleMarkdown,
        postId: proposal.postId,
        path: `glossary/${proposal.post.sourceLang}-${proposal.post.targetLang}/${slug}.md`,
        acceptedByLogin: input.user.login,
        acceptedAt: new Date(),
      },
      update: {
        translation: proposal.translation,
        rationaleMarkdown: proposal.rationaleMarkdown,
        acceptedByLogin: input.user.login,
        acceptedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.user.id,
        actorLogin: input.user.login,
        action: "proposal.accepted",
        targetType: "proposal",
        targetId: proposal.id,
        detailJson: JSON.stringify({
          postId: proposal.postId,
          translation: proposal.translation,
        }),
      },
    });
  });

  await enqueueGitHubJob({
    kind: "GLOSSARY_PR",
    postId: proposal.postId,
    idempotencyKey: `glossary:${proposal.postId}`,
  });

  return { ok: true, data: { postId: proposal.postId } };
}

/* -------------------------------------------------------------------------- */
/* Comments                                                                   */
/* -------------------------------------------------------------------------- */

export async function createComment(input: {
  user: SessionUser;
  postId: string;
  proposalId?: string | null;
  parentId?: string | null;
  body: string;
}): Promise<ActionResult<{ commentId: string }>> {
  const body = input.body.trim();
  if (!body) return fail("评论不能为空");
  if (body.length > MAX_COMMENT) return fail(`评论不能超过 ${MAX_COMMENT} 字`);

  const post = await prisma.post.findUnique({
    where: { id: input.postId },
    select: {
      id: true,
      status: true,
      authorLogin: true,
      upvotes: true,
      downvotes: true,
      githubIssueNumber: true,
    },
  });
  if (!post) return fail("帖子不存在");
  if (post.status !== POST_STATUS.PUBLISHED) return fail("该帖子当前不可评论");

  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.postId !== post.id) return fail("回复的评论不存在");
  }

  if (input.proposalId) {
    const proposal = await prisma.proposal.findUnique({ where: { id: input.proposalId } });
    if (!proposal || proposal.postId !== post.id) return fail("译法建议不存在");
  }

  const recent = await prisma.comment.count({
    where: {
      localAuthorId: input.user.id,
      createdAt: { gt: new Date(Date.now() - 60_000) },
    },
  });
  if (recent >= 3) return fail("发送过于频繁，请稍后再试");

  const now = new Date();
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        postId: post.id,
        proposalId: input.proposalId ?? null,
        parentId: input.parentId ?? null,
        authorLogin: input.user.login,
        authorName: input.user.name,
        authorAvatarUrl: input.user.avatarUrl,
        bodySnapshot: body,
        localAuthorId: input.user.id,
        isPostAuthor: input.user.login.toLowerCase() === post.authorLogin.toLowerCase(),
        status: COMMENT_STATUS.VISIBLE,
      },
      select: { id: true },
    });

    await tx.post.update({
      where: { id: post.id },
      data: {
        commentCount: { increment: 1 },
        lastActivityAt: now,
        hotScore: computeHotScore({
          upvotes: post.upvotes,
          downvotes: post.downvotes,
          lastActivityAt: now,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.user.id,
        actorLogin: input.user.login,
        action: "comment.created",
        targetType: "comment",
        targetId: created.id,
        detailJson: JSON.stringify({ postId: post.id, proposalId: input.proposalId ?? null }),
      },
    });

    return created;
  });

  await enqueueGitHubJob({
    kind: "COMMENT_CREATE",
    postId: post.id,
    commentId: comment.id,
    idempotencyKey: `comment:${comment.id}`,
  });

  return { ok: true, data: { commentId: comment.id } };
}

/* -------------------------------------------------------------------------- */
/* Reports and moderation                                                     */
/* -------------------------------------------------------------------------- */

export async function reportContent(input: {
  user: SessionUser;
  postId?: string | null;
  commentId?: string | null;
  reason: string;
  detail?: string | null;
}): Promise<ActionResult<{ reportId: string }>> {
  const reason = input.reason.trim() || "其他";
  if (!input.postId && !input.commentId) return fail("缺少举报对象");

  if (input.postId) {
    const post = await prisma.post.findUnique({ where: { id: input.postId } });
    if (!post) return fail("帖子不存在");
  }
  if (input.commentId) {
    const comment = await prisma.comment.findUnique({ where: { id: input.commentId } });
    if (!comment) return fail("评论不存在");
  }

  const recent = await prisma.report.count({
    where: { reporterId: input.user.id, createdAt: { gt: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= 10) return fail("举报过于频繁，请稍后再试");

  const report = await prisma.report.create({
    data: {
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
      reporterId: input.user.id,
      reason,
      detail: input.detail?.slice(0, 2000) ?? null,
      status: REPORT_STATUS.OPEN,
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: input.user.id,
      actorLogin: input.user.login,
      action: "report.created",
      targetType: input.postId ? "post" : "comment",
      targetId: input.postId ?? input.commentId ?? null,
      detailJson: JSON.stringify({ reason, reportId: report.id }),
    },
  });

  return { ok: true, data: { reportId: report.id } };
}

export async function moderatePost(input: {
  user: SessionUser;
  postId: string;
  action: "approve" | "hide" | "reject" | "restore";
}): Promise<ActionResult> {
  if (!hasRole(input.user.role, "MODERATOR")) return fail("没有审核权限");

  const post = await prisma.post.findUnique({ where: { id: input.postId } });
  if (!post) return fail("帖子不存在");

  const now = new Date();
  const data: PrismaPostUpdate = {};
  if (input.action === "approve") {
    data.status = POST_STATUS.PUBLISHED;
    data.publishedAt = post.publishedAt ?? now;
  } else if (input.action === "hide") {
    data.status = POST_STATUS.HIDDEN;
  } else if (input.action === "reject") {
    data.status = POST_STATUS.REJECTED;
  } else {
    data.status = POST_STATUS.PUBLISHED;
    data.publishedAt = post.publishedAt ?? now;
  }

  await prisma.$transaction([
    prisma.post.update({ where: { id: post.id }, data }),
    prisma.auditLog.create({
      data: {
        actorId: input.user.id,
        actorLogin: input.user.login,
        action: `post.${input.action}`,
        targetType: "post",
        targetId: post.id,
        detailJson: JSON.stringify({ from: post.status, to: data.status }),
      },
    }),
  ]);

  return { ok: true };
}

type PrismaPostUpdate = Pick<Partial<Post>, "status" | "publishedAt">;

export async function resolveReport(input: {
  user: SessionUser;
  reportId: string;
  resolution: "RESOLVED" | "DISMISSED";
  note?: string | null;
}): Promise<ActionResult> {
  if (!hasRole(input.user.role, "MODERATOR")) return fail("没有处理举报的权限");

  const report = await prisma.report.findUnique({ where: { id: input.reportId } });
  if (!report) return fail("举报不存在");
  if (report.status !== REPORT_STATUS.OPEN) return fail("该举报已经处理过了");

  await prisma.$transaction([
    prisma.report.update({
      where: { id: report.id },
      data: {
        status:
          input.resolution === "RESOLVED" ? REPORT_STATUS.RESOLVED : REPORT_STATUS.DISMISSED,
        resolution: input.note?.slice(0, 1000) ?? input.resolution,
        resolvedAt: new Date(),
        resolvedById: input.user.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.user.id,
        actorLogin: input.user.login,
        action: `report.${input.resolution.toLowerCase()}`,
        targetType: "report",
        targetId: report.id,
        detailJson: JSON.stringify({ note: input.note ?? null }),
      },
    }),
  ]);

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Labels used by the UI                                                      */
/* -------------------------------------------------------------------------- */

export const LANG_OPTIONS = LANGUAGES;
export const DOMAIN_OPTIONS = DOMAINS;
