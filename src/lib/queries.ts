import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { DOMAINS, POST_STATUS, type SortKey } from "./constants";
import { excerptText, parseReactions } from "./serialize";
import { decodeCursor, encodeCursor, SORT_ORDERS } from "./ranking";

/* -------------------------------------------------------------------------- */
/* Cards                                                                      */
/* -------------------------------------------------------------------------- */

const postSelect = {
  id: true,
  term: true,
  title: true,
  sourceLang: true,
  targetLang: true,
  domain: true,
  contextMarkdown: true,
  status: true,
  resolution: true,
  authorLogin: true,
  author: { select: { login: true, name: true, avatarUrl: true, role: true } },
  upvotes: true,
  downvotes: true,
  score: true,
  hotScore: true,
  commentCount: true,
  proposalCount: true,
  viewCount: true,
  publishedAt: true,
  lastActivityAt: true,
  createdAt: true,
  githubIssueNumber: true,
  githubIssueUrl: true,
  syncedAt: true,
  proposals: {
    where: { status: "ACCEPTED" },
    select: { id: true, translation: true },
    take: 1,
  },
} satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;

export type PostCard = {
  id: string;
  term: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  domain: string;
  excerpt: string;
  status: string;
  resolution: string;
  authorLogin: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorRole: string | null;
  upvotes: number;
  downvotes: number;
  score: number;
  hotScore: number;
  commentCount: number;
  proposalCount: number;
  viewCount: number;
  publishedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  syncedAt: Date;
  acceptedTranslation: string | null;
  acceptedProposalId: string | null;
};

function toCard(row: PostRow): PostCard {
  const accepted = row.proposals[0] ?? null;
  return {
    id: row.id,
    term: row.term,
    title: row.title,
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    domain: row.domain,
    excerpt: excerptText(row.contextMarkdown, 180),
    status: row.status,
    resolution: row.resolution,
    authorLogin: row.authorLogin,
    authorName: row.author?.name ?? null,
    authorAvatarUrl: row.author?.avatarUrl ?? null,
    authorRole: row.author?.role ?? null,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    score: row.score,
    hotScore: row.hotScore,
    commentCount: row.commentCount,
    proposalCount: row.proposalCount,
    viewCount: row.viewCount,
    publishedAt: row.publishedAt,
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
    githubIssueNumber: row.githubIssueNumber,
    githubIssueUrl: row.githubIssueUrl,
    syncedAt: row.syncedAt,
    acceptedTranslation: accepted?.translation ?? null,
    acceptedProposalId: accepted?.id ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export type ListPostsParams = {
  query?: string;
  domain?: string;
  sourceLang?: string;
  targetLang?: string;
  authorLogin?: string;
  sort?: SortKey;
  cursor?: string;
  limit?: number;
  /** A POST_STATUS value, or "ALL" for moderation views. */
  status?: string;
  includeBody?: boolean;
};

export async function listPosts(params: ListPostsParams = {}) {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 50);
  const sort: SortKey = params.sort ?? "hot";
  const status = params.status ?? POST_STATUS.PUBLISHED;

  const conditions: Prisma.PostWhereInput[] = [];
  if (status !== "ALL") conditions.push({ status });
  if (params.domain) conditions.push({ domain: params.domain });
  if (params.sourceLang) conditions.push({ sourceLang: params.sourceLang });
  if (params.targetLang) conditions.push({ targetLang: params.targetLang });
  if (params.authorLogin) conditions.push({ authorLogin: params.authorLogin.toLowerCase() });
  if (sort === "unanswered") conditions.push({ resolution: "OPEN" });

  const query = params.query?.trim();
  if (query) {
    conditions.push({
      OR: [
        { term: { contains: query, mode: "insensitive" } },
        { title: { contains: query, mode: "insensitive" } },
        { contextMarkdown: { contains: query, mode: "insensitive" } },
        ...(params.includeBody
          ? [{ bodyMarkdown: { contains: query, mode: "insensitive" } } satisfies Prisma.PostWhereInput]
          : []),
        { proposals: { some: { translation: { contains: query, mode: "insensitive" } } } },
      ],
    });
  }

  // Keyset pagination. `cursor` encodes the sort value plus the id tiebreaker,
  // so pages stay stable even while votes and hot scores change.
  const cursor = decodeCursor(params.cursor);
  if (cursor) {
    if (sort === "hot") {
      const value = Number(cursor.v);
      conditions.push({
        OR: [
          { hotScore: { lt: value } },
          { AND: [{ hotScore: value }, { id: { lt: cursor.id } }] },
        ],
      });
    } else if (sort === "top") {
      const value = Number(cursor.v);
      conditions.push({
        OR: [
          { score: { lt: value } },
          { AND: [{ score: value }, { id: { lt: cursor.id } }] },
        ],
      });
    } else {
      const value = new Date(String(cursor.v));
      conditions.push({
        OR: [
          { createdAt: { lt: value } },
          { AND: [{ createdAt: value }, { id: { lt: cursor.id } }] },
        ],
      });
    }
  }

  const where: Prisma.PostWhereInput = conditions.length ? { AND: conditions } : {};

  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: postSelect,
      orderBy: SORT_ORDERS[sort] as unknown as Prisma.PostOrderByWithRelationInput[],
      take: limit + 1,
    }),
    prisma.post.count({ where }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(toCard);
  const last = page.at(-1);

  const nextCursor =
    hasMore && last
      ? encodeCursor(
          sort === "hot"
            ? last.hotScore
            : sort === "top"
              ? last.score
              : last.createdAt.toISOString(),
          last.id,
        )
      : null;

  return { items, total, nextCursor, sort };
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                     */
/* -------------------------------------------------------------------------- */

export type CommentNode = {
  id: string;
  githubCommentId: string | null;
  authorLogin: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  reactions: Record<string, number>;
  isPostAuthor: boolean;
  status: string;
  createdAt: Date;
  replies: CommentNode[];
};

type CommentRow = {
  id: string;
  githubCommentId: string | null;
  proposalId: string | null;
  parentId: string | null;
  authorLogin: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  bodySnapshot: string;
  isPostAuthor: boolean;
  status: string;
  createdAt: Date;
};

function buildCommentTree(rows: CommentRow[], sort: "oldest" | "top" = "oldest"): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const row of rows) {
    if (row.status !== "VISIBLE") continue;
    nodes.set(row.id, {
      id: row.id,
      githubCommentId: row.githubCommentId,
      authorLogin: row.authorLogin,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
      body: row.bodySnapshot,
      reactions: {},
      isPostAuthor: row.isPostAuthor,
      status: row.status,
      createdAt: row.createdAt,
      replies: [],
    });
  }

  const roots: CommentNode[] = [];
  for (const row of rows) {
    if (row.status !== "VISIBLE") continue;
    const node = nodes.get(row.id);
    if (!node) continue;
    if (row.parentId && nodes.has(row.parentId)) {
      nodes.get(row.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  const sorter =
    sort === "top"
      ? (a: CommentNode, b: CommentNode) =>
          b.replies.length - a.replies.length ||
          a.createdAt.getTime() - b.createdAt.getTime()
      : (a: CommentNode, b: CommentNode) => a.createdAt.getTime() - b.createdAt.getTime();

  roots.sort(sorter);
  for (const root of roots) {
    root.replies.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return roots;
}

export type ProposalView = {
  id: string;
  translation: string;
  rationale: string;
  sourceUrl: string | null;
  status: string;
  authorLogin: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  upvotes: number;
  downvotes: number;
  score: number;
  githubCommentId: string | null;
  createdAt: Date;
  comments: CommentNode[];
  commentCount: number;
};

export async function getPostDetail(id: string, viewerId?: string | null) {
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: { login: true, name: true, avatarUrl: true, role: true, bio: true, affiliation: true } },
      revisions: { orderBy: { createdAt: "desc" }, take: 20 },
      glossary: true,
    },
  });
  if (!post) return null;

  const [proposalRows, commentRows, postVoteRows, userVote] = await Promise.all([
    prisma.proposal.findMany({
      where: { postId: post.id },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    }),
    prisma.comment.findMany({
      where: { postId: post.id, status: { not: "DELETED" } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.postVote.groupBy({
      by: ["value"],
      where: { postId: post.id },
      _count: { _all: true },
    }),
    viewerId
      ? prisma.postVote.findUnique({
          where: { postId_userId: { postId: post.id, userId: viewerId } },
          select: { value: true },
        })
      : Promise.resolve(null),
  ]);

  const proposalIds = proposalRows.map((proposal) => proposal.id);
  const userProposalVotes = viewerId && proposalIds.length
    ? await prisma.proposalVote.findMany({
        where: { userId: viewerId, proposalId: { in: proposalIds } },
        select: { proposalId: true, value: true },
      })
    : [];

  const rows = commentRows as unknown as CommentRow[];
  const topLevel = buildCommentTree(rows.filter((row) => !row.proposalId));
  const byProposal = new Map<string, CommentRow[]>();
  for (const row of rows) {
    if (!row.proposalId) continue;
    const bucket = byProposal.get(row.proposalId) ?? [];
    bucket.push(row);
    byProposal.set(row.proposalId, bucket);
  }

  const proposals: ProposalView[] = proposalRows.map((proposal) => {
    const comments = buildCommentTree(byProposal.get(proposal.id) ?? []);
    return {
      id: proposal.id,
      translation: proposal.translation,
      rationale: proposal.rationaleMarkdown,
      sourceUrl: proposal.sourceUrl,
      status: proposal.status,
      authorLogin: proposal.authorLogin,
      authorName: proposal.authorName,
      authorAvatarUrl: proposal.authorAvatarUrl,
      upvotes: proposal.upvotes,
      downvotes: proposal.downvotes,
      score: proposal.score,
      githubCommentId: proposal.githubCommentId,
      createdAt: proposal.createdAt,
      comments,
      commentCount: comments.reduce((sum, node) => sum + 1 + node.replies.length, 0),
    };
  });

  const upvotes = postVoteRows.find((row) => row.value === 1)?._count._all ?? 0;
  const downvotes = postVoteRows.find((row) => row.value === -1)?._count._all ?? 0;
  const accepted = proposals.find((proposal) => proposal.status === "ACCEPTED") ?? null;

  return {
    post: toCard({
      ...post,
      proposals: accepted ? [{ id: accepted.id, translation: accepted.translation }] : [],
    } as unknown as PostRow),
    raw: post,
    revisions: post.revisions,
    accepted,
    proposals,
    comments: topLevel,
    commentCount: rows.filter((row) => row.status === "VISIBLE").length,
    userVote: userVote?.value ?? 0,
    userProposalVotes: Object.fromEntries(
      userProposalVotes.map((vote) => [vote.proposalId, vote.value]),
    ) as Record<string, number>,
    votes: { upvotes, downvotes, score: upvotes - downvotes },
    glossary: post.glossary,
  };
}

export async function getPostRevisions(postId: string) {
  return prisma.postRevision.findMany({
    where: { postId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getRelatedPosts(postId: string, domain: string, limit = 5) {
  const rows = await prisma.post.findMany({
    where: {
      id: { not: postId },
      domain,
      status: POST_STATUS.PUBLISHED,
    },
    select: postSelect,
    orderBy: [{ hotScore: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.map(toCard);
}

/* -------------------------------------------------------------------------- */
/* Facets                                                                     */
/* -------------------------------------------------------------------------- */

export async function getDomainsWithCounts() {
  const grouped = await prisma.post.groupBy({
    by: ["domain"],
    where: { status: POST_STATUS.PUBLISHED },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((row) => [row.domain, row._count._all]));
  return DOMAINS.map((domain) => ({
    ...domain,
    count: counts.get(domain.slug) ?? 0,
  }));
}

export type LanguagePairSummary = {
  sourceLang: string;
  targetLang: string;
  count: number;
};

export async function getLanguagePairs(limit = 12): Promise<LanguagePairSummary[]> {
  const grouped = await prisma.post.groupBy({
    by: ["sourceLang", "targetLang"],
    where: { status: POST_STATUS.PUBLISHED },
    _count: { _all: true },
    orderBy: { _count: { sourceLang: "desc" } },
    take: limit,
  });
  return grouped.map((row) => ({
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    count: row._count._all,
  }));
}

/* -------------------------------------------------------------------------- */
/* Contributors                                                               */
/* -------------------------------------------------------------------------- */

export type ContributorSummary = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  affiliation: string | null;
  role: string | null;
  postCount: number;
  proposalCount: number;
  acceptedCount: number;
  score: number;
};

export async function getTopContributors(limit = 10): Promise<ContributorSummary[]> {
  const [postGroups, proposalGroups, acceptedGroups] = await Promise.all([
    prisma.post.groupBy({
      by: ["authorId"],
      where: { status: POST_STATUS.PUBLISHED },
      _count: { _all: true },
      _sum: { score: true },
      orderBy: { _sum: { score: "desc" } },
      take: limit * 3,
    }),
    prisma.proposal.groupBy({
      by: ["authorId"],
      _count: { _all: true },
    }),
    prisma.proposal.groupBy({
      by: ["authorId"],
      where: { status: "ACCEPTED" },
      _count: { _all: true },
    }),
  ]);

  const authorIds = Array.from(
    new Set([
      ...postGroups.map((row) => row.authorId),
      ...proposalGroups.map((row) => row.authorId).filter((id): id is string => !!id),
    ]),
  );
  if (authorIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, login: true, name: true, avatarUrl: true, affiliation: true, role: true },
  });
  const userMap = new Map(users.map((user) => [user.id, user]));

  const proposalCount = new Map(
    proposalGroups
      .filter((row) => row.authorId)
      .map((row) => [row.authorId as string, row._count._all]),
  );
  const acceptedCount = new Map(
    acceptedGroups
      .filter((row) => row.authorId)
      .map((row) => [row.authorId as string, row._count._all]),
  );

  return postGroups
    .flatMap((row) => {
      const user = userMap.get(row.authorId);
      if (!user) return [];
      return [
        {
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
          affiliation: user.affiliation,
          role: user.role,
          postCount: row._count._all,
          proposalCount: proposalCount.get(row.authorId) ?? 0,
          acceptedCount: acceptedCount.get(row.authorId) ?? 0,
          score: row._sum.score ?? 0,
        } satisfies ContributorSummary,
      ];
    })
    .sort((a, b) => b.acceptedCount - a.acceptedCount || b.score - a.score)
    .slice(0, limit);
}

export async function getContributorProfile(login: string) {
  const normalized = login.toLowerCase();
  const user = await prisma.user.findFirst({ where: { login: normalized } });

  const [posts, proposals] = await Promise.all([
    prisma.post.findMany({
      where: { status: POST_STATUS.PUBLISHED, authorLogin: normalized },
      select: postSelect,
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
    prisma.proposal.findMany({
      where: { authorLogin: normalized },
      include: { post: { select: { id: true, term: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const cards = posts.map(toCard);
  return {
    found: Boolean(user) || cards.length > 0 || proposals.length > 0,
    login: user?.login ?? login,
    name: user?.name ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    affiliation: user?.affiliation ?? null,
    bio: user?.bio ?? null,
    role: user?.role ?? null,
    posts: cards,
    proposals,
    stats: {
      posts: cards.length,
      score: cards.reduce((sum, post) => sum + post.score, 0),
      accepted: proposals.filter((proposal) => proposal.status === "ACCEPTED").length,
      proposals: proposals.length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

export async function getStats() {
  const [posts, contributors, comments, proposals, glossary, domains, lastSync] = await Promise.all([
    prisma.post.count({ where: { status: POST_STATUS.PUBLISHED } }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.comment.count({ where: { status: "VISIBLE" } }),
    prisma.proposal.count(),
    prisma.glossaryEntry.count(),
    prisma.post.groupBy({ by: ["domain"], where: { status: POST_STATUS.PUBLISHED } }),
    prisma.syncEvent.findFirst({ orderBy: { receivedAt: "desc" } }),
  ]);

  return {
    posts,
    contributors,
    comments,
    proposals,
    glossary,
    domains: domains.length,
    lastSyncAt: lastSync?.receivedAt ?? null,
    lastSyncStatus: lastSync?.status ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

export type SearchHit = {
  kind: "post" | "comment" | "proposal";
  postId: string;
  postTitle: string;
  postTerm: string;
  snippet: string;
  matchedIn: string[];
  author?: string;
  score: number;
  commentCount: number;
  publishedAt: Date | null;
};

function excerpt(text: string, query: string, radius = 110): string {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text.replace(/\s+/g, " ").slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

export async function searchPosts(query: string, limit = 20): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const rows = await prisma.post.findMany({
    where: {
      status: POST_STATUS.PUBLISHED,
      OR: [
        { term: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { contextMarkdown: { contains: q, mode: "insensitive" } },
        { bodyMarkdown: { contains: q, mode: "insensitive" } },
        { proposals: { some: { translation: { contains: q, mode: "insensitive" } } } },
      ],
    },
    select: postSelect,
    orderBy: [{ hotScore: "desc" }, { id: "desc" }],
    take: limit,
  });

  return rows.map((row) => {
    const matchedIn: string[] = [];
    if (row.term.toLowerCase().includes(q.toLowerCase())) matchedIn.push("术语");
    if (row.title.toLowerCase().includes(q.toLowerCase())) matchedIn.push("标题");
    if (row.contextMarkdown.toLowerCase().includes(q.toLowerCase())) matchedIn.push("语境");

    return {
      kind: "post" as const,
      postId: row.id,
      postTitle: row.title,
      postTerm: row.term,
      snippet: excerpt(row.contextMarkdown, q),
      matchedIn,
      author: row.authorLogin,
      score: row.score,
      commentCount: row.commentCount,
      publishedAt: row.publishedAt,
    };
  });
}

export async function searchComments(query: string, limit = 12): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const comments = await prisma.comment.findMany({
    where: {
      status: "VISIBLE",
      bodySnapshot: { contains: q, mode: "insensitive" },
      post: { status: POST_STATUS.PUBLISHED },
    },
    include: {
      post: {
        select: {
          id: true,
          term: true,
          title: true,
          score: true,
          commentCount: true,
          publishedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return comments.map<SearchHit>((comment) => ({
    kind: "comment",
    postId: comment.post.id,
    postTitle: comment.post.title,
    postTerm: comment.post.term,
    snippet: excerpt(comment.bodySnapshot, q),
    matchedIn: ["评论"],
    author: comment.authorLogin,
    score: comment.post.score,
    commentCount: comment.post.commentCount,
    publishedAt: comment.post.publishedAt,
  }));
}

export async function searchProposals(query: string, limit = 12): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const proposals = await prisma.proposal.findMany({
    where: {
      OR: [
        { translation: { contains: q, mode: "insensitive" } },
        { rationaleMarkdown: { contains: q, mode: "insensitive" } },
      ],
      post: { status: POST_STATUS.PUBLISHED },
    },
    include: {
      post: {
        select: {
          id: true,
          term: true,
          title: true,
          score: true,
          commentCount: true,
          publishedAt: true,
        },
      },
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return proposals.map<SearchHit>((proposal) => ({
    kind: "proposal",
    postId: proposal.post.id,
    postTitle: proposal.post.title,
    postTerm: proposal.post.term,
    snippet: excerpt(`${proposal.translation} — ${proposal.rationaleMarkdown}`, q),
    matchedIn: ["译法"],
    author: proposal.authorLogin,
    score: proposal.post.score,
    commentCount: proposal.post.commentCount,
    publishedAt: proposal.post.publishedAt,
  }));
}

export async function searchEverything(query: string) {
  const [posts, proposals, comments] = await Promise.all([
    searchPosts(query, 15),
    searchProposals(query, 10),
    searchComments(query, 10),
  ]);
  return {
    posts,
    proposals,
    comments,
    total: posts.length + proposals.length + comments.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Glossary                                                                   */
/* -------------------------------------------------------------------------- */

export type GlossaryParams = {
  query?: string;
  sourceLang?: string;
  targetLang?: string;
  domain?: string;
  cursor?: string;
  limit?: number;
};

export async function listGlossary(params: GlossaryParams = {}) {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const conditions: Prisma.GlossaryEntryWhereInput[] = [];
  if (params.sourceLang) conditions.push({ sourceLang: params.sourceLang });
  if (params.targetLang) conditions.push({ targetLang: params.targetLang });
  if (params.domain) conditions.push({ domain: params.domain });
  const query = params.query?.trim();
  if (query) {
    conditions.push({
      OR: [
        { term: { contains: query, mode: "insensitive" } },
        { translation: { contains: query, mode: "insensitive" } },
      ],
    });
  }

  const cursor = params.cursor
    ? await prisma.glossaryEntry.findUnique({ where: { id: params.cursor }, select: { term: true, id: true } })
    : null;

  const where: Prisma.GlossaryEntryWhereInput = {
    ...(conditions.length ? { AND: conditions } : {}),
    ...(cursor
      ? {
          OR: [
            { term: { gt: cursor.term } },
            { AND: [{ term: cursor.term }, { id: { gt: cursor.id } }] },
          ],
        }
      : {}),
  };

  const rows = await prisma.glossaryEntry.findMany({
    where,
    orderBy: [{ term: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items,
    total: await prisma.glossaryEntry.count({
      where: conditions.length ? { AND: conditions } : {},
    }),
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export async function getAdminOverview() {
  const [pending, reports, syncEvents, writeJobs, auditLogs, counts] = await Promise.all([
    prisma.post.findMany({
      where: { status: POST_STATUS.PENDING_REVIEW },
      include: { author: { select: { login: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.report.findMany({
      where: { status: "OPEN" },
      include: {
        post: { select: { id: true, term: true, title: true } },
        reporter: { select: { login: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.syncEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 12 }),
    prisma.gitHubWriteJob.findMany({
      where: { status: { in: ["PENDING", "PROCESSING", "DEAD"] } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    Promise.all([
      prisma.post.count(),
      prisma.post.count({ where: { status: { in: [POST_STATUS.HIDDEN, POST_STATUS.REJECTED] } } }),
      prisma.user.count(),
      prisma.proposal.count(),
    ]),
  ]);

  const [postCount, hiddenCount, userCount, proposalCount] = counts;
  return {
    pending,
    reports,
    syncEvents,
    writeJobs,
    auditLogs,
    postCount,
    hiddenCount,
    userCount,
    proposalCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Leaderboards                                                               */
/* -------------------------------------------------------------------------- */

export async function getLeaderboards() {
  const base = {
    status: POST_STATUS.PUBLISHED,
  } satisfies Prisma.PostWhereInput;

  const [hot, top, discussed, recent, contributors] = await Promise.all([
    prisma.post.findMany({
      where: base,
      select: postSelect,
      orderBy: [{ hotScore: "desc" }, { id: "desc" }],
      take: 10,
    }),
    prisma.post.findMany({
      where: base,
      select: postSelect,
      orderBy: [{ score: "desc" }, { commentCount: "desc" }],
      take: 10,
    }),
    prisma.post.findMany({
      where: base,
      select: postSelect,
      orderBy: [{ proposalCount: "desc" }, { commentCount: "desc" }],
      take: 10,
    }),
    prisma.post.findMany({
      where: base,
      select: postSelect,
      orderBy: [{ createdAt: "desc" }],
      take: 6,
    }),
    getTopContributors(10),
  ]);

  return {
    hot: hot.map(toCard),
    top: top.map(toCard),
    discussed: discussed.map(toCard),
    recent: recent.map(toCard),
    contributors,
  };
}

export async function getDiscussionStats(postId: string) {
  const [comments, participants] = await Promise.all([
    prisma.comment.count({ where: { postId, status: "VISIBLE" } }),
    prisma.comment.groupBy({
      by: ["authorLogin"],
      where: { postId, status: "VISIBLE" },
      _count: { _all: true },
    }),
  ]);
  return { comments, participants: participants.length, topParticipants: participants };
}
