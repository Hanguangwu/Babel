import type { Comment, Post, Proposal } from "@prisma/client";
import { prisma } from "./db";
import {
  ACCEPTED_LABEL,
  DISCUSSION_LABEL,
  DOMAIN_LABEL_PREFIX,
  LANG_LABEL_PREFIX,
  domainName,
  languageName,
} from "./constants";
import { glossaryRepoPath, parseGlossaryFile, renderGlossaryFile, slugifyTerm } from "./glossary";
import {
  createGlossaryPullRequest,
  createIssue,
  createIssueComment,
  type IssueCommentSnapshot,
  type IssueSnapshot,
} from "./github";
import { computeHotScore } from "./ranking";

/* -------------------------------------------------------------------------- */
/* Markers                                                                    */
/* -------------------------------------------------------------------------- */

const MARKERS = {
  post: /<!--\s*babel:post:([A-Za-z0-9_-]+)\s*-->/,
  proposal: /<!--\s*babel:proposal:([A-Za-z0-9_-]+)\s*-->/,
  comment: /<!--\s*babel:comment:([A-Za-z0-9_-]+)\s*-->/,
} as const;

export type MarkerKind = keyof typeof MARKERS;

export function extractMarker(body: string | null | undefined, kind: MarkerKind): string | null {
  if (!body) return null;
  return body.match(MARKERS[kind])?.[1] ?? null;
}

export function renderIssueBody(post: Post): string {
  return [
    `<!-- babel:post:${post.id} -->`,
    `## 术语`,
    ``,
    `**${post.term}**`,
    ``,
    `- 语言对：${languageName(post.sourceLang)} → ${languageName(post.targetLang)}`,
    `- 领域：${domainName(post.domain)}`,
    `- 发起人：@${post.authorLogin}`,
    ``,
    `## 语境`,
    ``,
    post.contextMarkdown.trim() || "_（未填写）_",
    ...(post.bodyMarkdown.trim()
      ? [``, `## 补充说明`, ``, post.bodyMarkdown.trim()]
      : []),
    ``,
    `---`,
    `由 Babel 译词论坛创建，译法建议与讨论会同步到这里。`,
    ``,
  ].join("\n");
}

export function renderProposalComment(proposal: Proposal): string {
  return [
    `<!-- babel:proposal:${proposal.id} -->`,
    `### 译法建议：${proposal.translation}`,
    ``,
    proposal.rationaleMarkdown.trim(),
    ...(proposal.sourceUrl ? [``, `出处：${proposal.sourceUrl}`] : []),
    ``,
    `— @${proposal.authorLogin}`,
  ].join("\n");
}

export function renderCommentMirror(comment: Comment): string {
  return [`<!-- babel:comment:${comment.id} -->`, comment.bodySnapshot].join("\n");
}

export function issueLabels(post: Post): string[] {
  return [
    DISCUSSION_LABEL,
    `${LANG_LABEL_PREFIX}${post.sourceLang}-${post.targetLang}`,
    `${DOMAIN_LABEL_PREFIX}${post.domain}`,
    ...(post.resolution === "RESOLVED" ? [ACCEPTED_LABEL] : []),
  ];
}

/* -------------------------------------------------------------------------- */
/* Issue -> database                                                          */
/* -------------------------------------------------------------------------- */

export type IngestOutcome = "created" | "updated" | "unchanged" | "skipped" | "orphan";

export async function upsertPostFromIssue(issue: IssueSnapshot): Promise<IngestOutcome> {
  const postId = extractMarker(issue.body, "post");
  if (!postId) return "skipped";

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return "orphan";

  const moderationLocked = post.status === "HIDDEN" || post.status === "REJECTED";
  const resolution = moderationLocked
    ? post.resolution
    : issue.labels.includes(ACCEPTED_LABEL)
      ? "RESOLVED"
      : post.resolution;

  if (
    post.githubIssueNumber === issue.number &&
    post.githubIssueUrl === issue.htmlUrl &&
    post.resolution === resolution
  ) {
    return "unchanged";
  }

  try {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        githubIssueNumber: issue.number,
        githubIssueUrl: issue.htmlUrl,
        resolution,
        syncedAt: new Date(),
      },
    });
    return "updated";
  } catch {
    // Unique violation: another post already claimed this issue number.
    return "skipped";
  }
}

export async function upsertCommentFromGitHub(
  post: Pick<Post, "id" | "authorLogin" | "status" | "upvotes" | "downvotes">,
  snapshot: IssueCommentSnapshot,
): Promise<IngestOutcome> {
  const commentId = extractMarker(snapshot.body, "comment");
  const proposalId = extractMarker(snapshot.body, "proposal");

  if (proposalId) {
    const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
    if (proposal && !proposal.githubCommentId) {
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: { githubCommentId: String(snapshot.id) },
      });
      return "updated";
    }
    return "skipped";
  }

  if (commentId) {
    const existing = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!existing) return "orphan";
    if (existing.bodySnapshot === snapshot.body) return "unchanged";
    await prisma.comment.update({
      where: { id: existing.id },
      data: { bodySnapshot: snapshot.body, updatedAt: new Date(snapshot.updatedAt) },
    });
    return "updated";
  }

  // Comment written directly on GitHub by someone who never used the site.
  const githubCommentId = String(snapshot.id);
  const existing = await prisma.comment.findUnique({ where: { githubCommentId } });
  if (existing) {
    if (existing.bodySnapshot === snapshot.body) return "unchanged";
    await prisma.comment.update({
      where: { id: existing.id },
      data: { bodySnapshot: snapshot.body, updatedAt: new Date(snapshot.updatedAt) },
    });
    return "updated";
  }

  const now = new Date();
  const comment = await prisma.comment.create({
    data: {
      postId: post.id,
      githubCommentId,
      authorGithubId: snapshot.authorId || null,
      authorLogin: snapshot.authorLogin,
      authorName: snapshot.authorName,
      authorAvatarUrl: snapshot.authorAvatarUrl,
      bodySnapshot: snapshot.body,
      isPostAuthor: snapshot.authorLogin.toLowerCase() === post.authorLogin.toLowerCase(),
      syncedAt: now,
    },
  });

  await prisma.post.update({
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

  await prisma.auditLog.create({
    data: {
      actorLogin: snapshot.authorLogin,
      action: "comment.imported",
      targetType: "comment",
      targetId: comment.id,
      detailJson: JSON.stringify({ postId: post.id, githubCommentId }),
    },
  });

  return "created";
}

/* -------------------------------------------------------------------------- */
/* Glossary                                                                   */
/* -------------------------------------------------------------------------- */

export async function upsertGlossaryEntry(input: {
  path: string;
  content: string;
  commitSha?: string | null;
}): Promise<IngestOutcome> {
  const { frontmatter, body } = parseGlossaryFile(input.content);
  const slug = slugifyTerm(frontmatter.term);

  const existing = await prisma.glossaryEntry.findUnique({
    where: {
      sourceLang_targetLang_slug: {
        sourceLang: frontmatter.sourceLang,
        targetLang: frontmatter.targetLang,
        slug,
      },
    },
  });

  await prisma.glossaryEntry.upsert({
    where: {
      sourceLang_targetLang_slug: {
        sourceLang: frontmatter.sourceLang,
        targetLang: frontmatter.targetLang,
        slug,
      },
    },
    create: {
      slug,
      term: frontmatter.term,
      translation: frontmatter.translation,
      sourceLang: frontmatter.sourceLang,
      targetLang: frontmatter.targetLang,
      domain: frontmatter.domain,
      rationaleMarkdown: frontmatter.rationale ?? body,
      postId: frontmatter.postId ?? null,
      path: input.path,
      commitSha: input.commitSha ?? null,
      acceptedByLogin: frontmatter.acceptedBy ?? null,
      acceptedAt: frontmatter.acceptedAt ? new Date(frontmatter.acceptedAt) : new Date(),
    },
    update: {
      term: frontmatter.term,
      translation: frontmatter.translation,
      domain: frontmatter.domain,
      rationaleMarkdown: frontmatter.rationale ?? body,
      path: input.path,
      commitSha: input.commitSha ?? null,
      acceptedByLogin: frontmatter.acceptedBy ?? null,
    },
  });

  if (frontmatter.postId) {
    await prisma.post.updateMany({
      where: { id: frontmatter.postId },
      data: { resolution: "RESOLVED", syncedAt: new Date() },
    });
  }

  return existing ? "updated" : "created";
}

/* -------------------------------------------------------------------------- */
/* Outbound queue                                                             */
/* -------------------------------------------------------------------------- */

export type GitHubJobKind =
  | "ISSUE_CREATE"
  | "COMMENT_CREATE"
  | "PROPOSAL_CREATE"
  | "GLOSSARY_PR";

export async function enqueueGitHubJob(input: {
  kind: GitHubJobKind;
  postId?: string;
  commentId?: string;
  proposalId?: string;
  idempotencyKey: string;
}): Promise<void> {
  await prisma.gitHubWriteJob.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      kind: input.kind,
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
      proposalId: input.proposalId ?? null,
      idempotencyKey: input.idempotencyKey,
    },
    update: {},
  });
}

function backoffMinutes(attempts: number): number {
  return Math.min(60, Math.pow(2, Math.max(0, attempts)));
}

async function runJob(job: {
  id: string;
  kind: string;
  postId: string | null;
  commentId: string | null;
  proposalId: string | null;
}): Promise<void> {
  if (job.kind === "ISSUE_CREATE" && job.postId) {
    const post = await prisma.post.findUnique({ where: { id: job.postId } });
    if (!post || post.githubIssueNumber) return;
    const issue = await createIssue({
      title: `${post.term}｜${post.title}`,
      body: renderIssueBody(post),
      labels: issueLabels(post),
    });
    await prisma.post.update({
      where: { id: post.id },
      data: { githubIssueNumber: issue.number, githubIssueUrl: issue.url, syncedAt: new Date() },
    });
    return;
  }

  if (job.kind === "COMMENT_CREATE" && job.commentId) {
    const comment = await prisma.comment.findUnique({
      where: { id: job.commentId },
      include: { post: true },
    });
    if (!comment || comment.githubCommentId) return;
    if (!comment.post.githubIssueNumber) {
      throw new Error("帖子还没有对应的 GitHub Issue，稍后重试");
    }
    const remote = await createIssueComment(
      comment.post.githubIssueNumber,
      renderCommentMirror(comment),
    );
    await prisma.comment.update({
      where: { id: comment.id },
      data: { githubCommentId: String(remote.id), syncedAt: new Date() },
    });
    return;
  }

  if (job.kind === "PROPOSAL_CREATE" && job.proposalId) {
    const proposal = await prisma.proposal.findUnique({
      where: { id: job.proposalId },
      include: { post: true },
    });
    if (!proposal || proposal.githubCommentId) return;
    if (!proposal.post.githubIssueNumber) {
      throw new Error("帖子还没有对应的 GitHub Issue，稍后重试");
    }
    const remote = await createIssueComment(
      proposal.post.githubIssueNumber,
      renderProposalComment(proposal),
    );
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { githubCommentId: String(remote.id) },
    });
    return;
  }

  if (job.kind === "GLOSSARY_PR" && job.postId) {
    const post = await prisma.post.findUnique({ where: { id: job.postId } });
    if (!post) return;
    const entry = await prisma.glossaryEntry.findUnique({ where: { postId: post.id } });
    if (!entry || entry.commitSha) return;

    const cursorKey = `glossary-pr:${post.id}`;
    const already = await prisma.syncCursor.findUnique({ where: { key: cursorKey } });
    if (already) return;

    const proposal = await prisma.proposal.findFirst({
      where: { postId: post.id, status: "ACCEPTED" },
    });
    if (!proposal) throw new Error("帖子没有已采纳的译法");

    const frontmatter = {
      term: entry.term,
      translation: entry.translation,
      sourceLang: entry.sourceLang,
      targetLang: entry.targetLang,
      domain: entry.domain,
      rationale: proposal.rationaleMarkdown,
      postId: post.id,
      acceptedBy: entry.acceptedByLogin ?? undefined,
      acceptedAt: entry.acceptedAt.toISOString(),
    };
    const path = entry.path || glossaryRepoPath(frontmatter);
    const content = renderGlossaryFile({
      frontmatter,
      discussionUrl: post.githubIssueUrl,
    });

    const pr = await createGlossaryPullRequest({
      path,
      content,
      message: `glossary: ${entry.term} → ${entry.translation}`,
      title: `术语库：${entry.term} → ${entry.translation}`,
      body: [
        `来源帖子：${post.githubIssueUrl ?? post.id}`,
        "",
        `- 语言对：${entry.sourceLang} → ${entry.targetLang}`,
        `- 领域：${entry.domain}`,
        `- 采纳人：@${entry.acceptedByLogin ?? "unknown"}`,
      ].join("\n"),
    });

    await prisma.syncCursor.upsert({
      where: { key: cursorKey },
      create: { key: cursorKey, value: pr.url },
      update: { value: pr.url },
    });
    return;
  }

  throw new Error(`未知的 GitHub 任务类型: ${job.kind}`);
}

export async function processWriteJobs(limit = 10): Promise<{ done: number; failed: number }> {
  const now = new Date();
  const jobs = await prisma.gitHubWriteJob.findMany({
    where: { status: "PENDING", runAfter: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 25),
  });

  let done = 0;
  let failed = 0;

  for (const job of jobs) {
    const claimed = await prisma.gitHubWriteJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    try {
      await runJob(job);
      await prisma.gitHubWriteJob.update({
        where: { id: job.id },
        data: { status: "DONE", lastError: null },
      });
      done += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const dead = attempts >= 5;
      await prisma.gitHubWriteJob.update({
        where: { id: job.id },
        data: {
          status: dead ? "DEAD" : "PENDING",
          attempts,
          lastError: (error instanceof Error ? error.message : "unknown").slice(0, 1000),
          runAfter: new Date(Date.now() + backoffMinutes(attempts) * 60_000),
        },
      });
      failed += 1;
    }
  }

  return { done, failed };
}

export async function recomputeHotScores(): Promise<number> {
  const now = new Date();
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, upvotes: true, downvotes: true, lastActivityAt: true },
  });

  let updated = 0;
  for (const post of posts) {
    const hotScore = computeHotScore({
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      lastActivityAt: post.lastActivityAt,
      now,
    });
    await prisma.post.update({ where: { id: post.id }, data: { hotScore } });
    updated += 1;
  }
  return updated;
}
