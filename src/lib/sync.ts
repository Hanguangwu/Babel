import { prisma } from "./db";
import {
  fetchFile,
  fetchIssue,
  fetchIssueComments,
  fetchRepoTree,
  listPostIssues,
} from "./github";
import {
  processWriteJobs,
  recomputeHotScores,
  upsertCommentFromGitHub,
  upsertGlossaryEntry,
  upsertPostFromIssue,
} from "./ingest";
import { GLOSSARY_CONTENT_DIR } from "./glossary";

export type SyncReport = {
  posts: number;
  comments: number;
  glossary: number;
  skipped: number;
  errors: string[];
};

export type IngestCount = { updated: number };

function emptyReport(): SyncReport {
  return { posts: 0, comments: 0, glossary: 0, skipped: 0, errors: [] };
}

const POST_MARKER = /<!--\s*babel:post:([A-Za-z0-9_-]+)\s*-->/;

/**
 * Pull a bounded slice of the content repository:
 *   - issues labelled `term-post` (max 3 pages of 50)
 *   - their comments since the per-issue cursor
 *   - glossary markdown changed since the last tree snapshot (max 25 files)
 *
 * Designed for cron / queue consumers: it never runs unbounded work.
 */
export async function syncFromGitHub(options: { actorLogin?: string } = {}): Promise<SyncReport> {
  const report = emptyReport();

  for (let page = 1; page <= 3; page += 1) {
    const issues = await listPostIssues({ page, perPage: 50 });
    if (issues.length === 0) break;

    for (const issue of issues) {
      try {
        const outcome = await upsertPostFromIssue(issue);
        if (outcome === "created" || outcome === "updated") report.posts += 1;
        else report.skipped += 1;

        const postId = issue.body.match(POST_MARKER)?.[1];
        if (!postId) continue;

        const post = await prisma.post.findUnique({
          where: { id: postId },
          select: { id: true, authorLogin: true, status: true, upvotes: true, downvotes: true },
        });
        if (!post) continue;

        const cursorKey = `issue:${issue.number}`;
        const cursor = await prisma.syncCursor.findUnique({ where: { key: cursorKey } });
        const comments = await fetchIssueComments(issue.number, cursor?.value);

        for (const snapshot of comments) {
          const result = await upsertCommentFromGitHub(post, snapshot);
          if (result === "created" || result === "updated") report.comments += 1;
        }

        await prisma.syncCursor.upsert({
          where: { key: cursorKey },
          create: { key: cursorKey, value: new Date().toISOString() },
          update: { value: new Date().toISOString() },
        });
      } catch (error) {
        report.errors.push(
          `issue #${issue.number}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    if (issues.length < 50) break;
  }

  try {
    report.glossary = await syncGlossary();
  } catch (error) {
    report.errors.push(`glossary: ${error instanceof Error ? error.message : "unknown"}`);
  }

  await prisma.syncEvent.create({
    data: {
      deliveryId: `sync:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      eventName: "sync.manual",
      repoId: process.env.GITHUB_CONTENT_REPO ?? null,
      payloadHash: `manual:${options.actorLogin ?? "system"}`,
      status: report.errors.length ? "FAILED" : "PROCESSED",
      error: report.errors.length ? report.errors.join("\n").slice(0, 2000) : null,
      processedAt: new Date(),
    },
  });

  return report;
}

/** Sync one issue's comments on demand (webhook path, cheap). */
export async function syncIssueDiscussion(issueNumber: number): Promise<IngestCount> {
  const issue = await fetchIssue(issueNumber);
  if (!issue) return { updated: 0 };

  await upsertPostFromIssue(issue);
  const postId = issue.body.match(POST_MARKER)?.[1];
  if (!postId) return { updated: 0 };

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorLogin: true, status: true, upvotes: true, downvotes: true },
  });
  if (!post) return { updated: 0 };

  const cursorKey = `issue:${issueNumber}`;
  const cursor = await prisma.syncCursor.findUnique({ where: { key: cursorKey } });
  const comments = await fetchIssueComments(issueNumber, cursor?.value);

  let updated = 0;
  for (const snapshot of comments) {
    const result = await upsertCommentFromGitHub(post, snapshot);
    if (result === "created" || result === "updated") updated += 1;
  }

  await prisma.syncCursor.upsert({
    where: { key: cursorKey },
    create: { key: cursorKey, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });

  return { updated };
}

/** Import every glossary markdown file that is new or changed. */
export async function syncGlossary(limit = 25): Promise<number> {
  const branch = process.env.GITHUB_CONTENT_BRANCH || "main";
  const tree = await fetchRepoTree(branch);
  const files = tree
    .filter(
      (entry) =>
        entry.path.startsWith(`${GLOSSARY_CONTENT_DIR}/`) && entry.path.endsWith(".md"),
    )
    .slice(0, limit);

  let imported = 0;
  for (const entry of files) {
    const existing = await prisma.glossaryEntry.findFirst({
      where: { path: entry.path },
      select: { commitSha: true },
    });
    if (existing?.commitSha === entry.sha) continue;

    const file = await fetchFile(entry.path, branch);
    if (!file) continue;

    const outcome = await upsertGlossaryEntry({
      path: entry.path,
      content: file.content,
      commitSha: entry.sha,
    });
    if (outcome !== "skipped") imported += 1;
  }

  return imported;
}

/**
 * Daily / manual reconciliation: drain the outbound queue, pull GitHub state
 * for a bounded slice, and recompute hot scores.
 */
export async function reconcile(): Promise<SyncReport & { jobs: number; hot: number }> {
  const jobs = await processWriteJobs(20);
  const report = await syncFromGitHub({ actorLogin: "cron" });
  const hot = await recomputeHotScores();

  return { ...report, jobs: jobs.done, hot };
}
