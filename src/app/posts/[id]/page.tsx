import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, GitBranch, MessageSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { POST_STATUS, domainName, hasRole, languagePairLabel } from "@/lib/constants";
import { getPostDetail, getRelatedPosts } from "@/lib/queries";
import { formatDate, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { DomainChip, LangPair, ResolutionBadge, RoleBadge, StatusBadge } from "@/components/badges";
import { Markdown } from "@/components/markdown";
import { ProposalCard } from "@/components/proposal-card";
import { Discussion } from "@/components/discussion";
import { VoteControl } from "@/components/vote-control";
import { createProposalAction, reportAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  proposed: "译法已提交，并已加入 GitHub 同步队列。",
  accepted: "已采纳该译法，术语库 PR 将在后台创建。",
  reported: "举报已收到，版主会尽快处理。",
};

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; proposed?: string; accepted?: string; reported?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const detail = await getPostDetail(id, user?.id);
  if (!detail) notFound();

  const isModerator = !!user && hasRole(user.role, "MODERATOR");
  if (detail.raw.status !== POST_STATUS.PUBLISHED && !isModerator) notFound();

  const related = await getRelatedPosts(detail.raw.id, detail.raw.domain, 4);
  const canAccept = isModerator;
  const resolved = detail.post.resolution === "RESOLVED";
  const notice = sp.proposed ? NOTICES.proposed : sp.accepted ? NOTICES.accepted : sp.reported ? NOTICES.reported : null;

  return (
    <div className="container-page py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-[var(--color-ink-faint)]">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-[var(--color-accent)]">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          返回列表
        </Link>
        <span className="mono text-[0.68rem]">
          {detail.raw.id} · 同步于 {timeAgo(detail.raw.syncedAt)}
        </span>
      </div>

      {sp.error && <div className="banner banner-error mb-4">{decodeURIComponent(sp.error)}</div>}
      {notice && <div className="banner banner-ok mb-4">{notice}</div>}
      {detail.raw.status !== POST_STATUS.PUBLISHED && (
        <div className="banner banner-error mb-4">
          该帖子当前状态为「{detail.raw.status}」，只有版主可见。
        </div>
      )}

      <div className="detail-grid">
        <div className="min-w-0">
          <header className="border-b border-[var(--color-line)] pb-5">
            <div className="flex items-start gap-4">
              <div className="pt-1">
                <VoteControl
                  targetId={detail.raw.id}
                  kind="post"
                  initialScore={detail.votes.score}
                  initialVote={detail.userVote}
                />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="font-serif text-[1.9rem] font-semibold leading-tight tracking-tight sm:text-[2.2rem]">
                  {detail.raw.term}
                </h1>
                <p className="mt-1 text-[0.95rem] text-[var(--color-ink-soft)]">{detail.raw.title}</p>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <LangPair source={detail.raw.sourceLang} target={detail.raw.targetLang} />
                  <DomainChip slug={detail.raw.domain} />
                  <ResolutionBadge resolution={detail.raw.resolution} />
                  {detail.raw.status !== POST_STATUS.PUBLISHED && <StatusBadge status={detail.raw.status} />}
                  {detail.glossary && <span className="chip chip-moss">已在术语库</span>}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.74rem] text-[var(--color-ink-faint)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar
                      src={detail.post.authorAvatarUrl}
                      name={detail.post.authorName ?? detail.raw.authorLogin}
                      size={18}
                    />
                    <Link href={`/u/${detail.raw.authorLogin}`} className="link-quiet font-medium text-[var(--color-ink)]">
                      {detail.post.authorName ?? detail.raw.authorLogin}
                    </Link>
                  </span>
                  <RoleBadge role={detail.post.authorRole} />
                  <span>{formatDate(detail.raw.publishedAt ?? detail.raw.createdAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" aria-hidden />
                    {detail.commentCount} 条讨论
                  </span>
                  {detail.raw.githubIssueNumber && (
                    <a
                      href={detail.raw.githubIssueUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 link-quiet"
                    >
                      <GitBranch className="h-3 w-3" aria-hidden />
                      Issue #{detail.raw.githubIssueNumber}
                      <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </header>

          {resolved && detail.accepted && (
            <section className="mt-5 border border-[#b9cfc0] bg-[var(--color-moss-soft)] p-4">
              <p className="label text-[var(--color-moss)]">已采纳</p>
              <p className="mt-1 font-serif text-[1.25rem] font-semibold">{detail.accepted.translation}</p>
              <p className="mt-1 text-[0.8rem] leading-relaxed text-[var(--color-ink-soft)]">
                {detail.glossary
                  ? `已写入术语库：${detail.glossary.path}`
                  : "术语库 PR 正在后台创建，合并后会出现在术语库页面。"}
              </p>
              <Link href="/glossary" className="mt-2 inline-block text-[0.75rem] link-underline">
                查看术语库
              </Link>
            </section>
          )}

          <section className="mt-6">
            <h2 className="label">语境与问题</h2>
            <div className="mt-2">
              <Markdown>{detail.raw.contextMarkdown}</Markdown>
            </div>
            {detail.raw.bodyMarkdown && (
              <div className="mt-5 border-t border-[var(--color-line)] pt-4">
                <h2 className="label">补充说明</h2>
                <div className="mt-2">
                  <Markdown>{detail.raw.bodyMarkdown}</Markdown>
                </div>
              </div>
            )}
          </section>

          <section id="proposals" className="mt-10 scroll-mt-24">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1.2rem] font-semibold">
                候选译法 <span className="mono text-[0.8rem] font-normal text-[var(--color-ink-faint)]">{detail.proposals.length}</span>
              </h2>
              {resolved && <p className="text-[0.72rem] text-[var(--color-ink-faint)]">已有定译，仍可补充不同语境下的用法</p>}
            </div>

            <div className="mt-4 space-y-3">
              {detail.proposals.length === 0 ? (
                <p className="border border-dashed border-[var(--color-line-strong)] px-4 py-8 text-center text-[0.84rem] text-[var(--color-ink-faint)]">
                  还没有候选译法。第一条建议不需要完美，写清楚为什么这样译就够了。
                </p>
              ) : (
                detail.proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    postId={detail.raw.id}
                    user={user}
                    userVote={detail.userProposalVotes[proposal.id] ?? 0}
                    canAccept={canAccept}
                    resolved={resolved}
                  />
                ))
              )}
            </div>

            {user ? (
              <details className="mt-5 border border-[var(--color-line)] bg-[var(--color-paper-raised)]">
                <summary className="px-4 py-3 text-[0.85rem] font-medium">
                  提交一个译法
                </summary>
                <form action={createProposalAction} className="space-y-3 border-t border-[var(--color-line)] p-4">
                  <input type="hidden" name="postId" value={detail.raw.id} />
                  <div>
                    <label htmlFor="translation" className="label">你的译法</label>
                    <input
                      id="translation"
                      name="translation"
                      required
                      maxLength={200}
                      placeholder="尽量是一个可直接使用的对应词"
                      className="field mt-1"
                    />
                  </div>
                  <div>
                    <label htmlFor="rationale" className="label">理由与用例</label>
                    <textarea
                      id="rationale"
                      name="rationale"
                      required
                      rows={5}
                      maxLength={5000}
                      placeholder="为什么这样译？有没有语料、行业惯例或反例？"
                      className="field mt-1 text-[0.88rem]"
                    />
                  </div>
                  <div>
                    <label htmlFor="sourceUrl" className="label">出处链接（可选）</label>
                    <input
                      id="sourceUrl"
                      name="sourceUrl"
                      type="url"
                      maxLength={500}
                      placeholder="https://…"
                      className="field mt-1"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">
                    提交译法
                  </button>
                </form>
              </details>
            ) : (
              <p className="mt-5 border border-dashed border-[var(--color-line-strong)] px-4 py-4 text-center text-[0.8rem]">
                <Link href={`/login?next=${encodeURIComponent(`/posts/${detail.raw.id}`)}`} className="link-underline">
                  登录
                </Link>{" "}
                后可以提交译法与投票。
              </p>
            )}
          </section>

          <section id="discussion" className="mt-10 scroll-mt-24">
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1.2rem] font-semibold">讨论</h2>
              <p className="text-[0.72rem] text-[var(--color-ink-faint)]">{detail.commentCount} 条</p>
            </div>
            <div className="mt-4">
              <Discussion
                postId={detail.raw.id}
                comments={detail.comments}
                isAuthenticated={!!user}
              />
            </div>
          </section>

          {user && (
            <details className="mt-8 text-[0.75rem] text-[var(--color-ink-faint)]">
              <summary className="hover:text-[var(--color-accent)]">举报这个帖子</summary>
              <form action={reportAction} className="mt-2 max-w-md space-y-2">
                <input type="hidden" name="postId" value={detail.raw.id} />
                <input name="reason" required maxLength={80} placeholder="理由，例如广告、人身攻击" className="field" />
                <textarea name="detail" rows={3} maxLength={2000} placeholder="补充说明（可选）" className="field" />
                <button type="submit" className="btn btn-outline btn-sm">提交举报</button>
              </form>
            </details>
          )}
        </div>

        <aside className="space-y-6">
          <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
            <p className="label">发起人</p>
            <div className="mt-2 flex items-start gap-3">
              <Avatar src={detail.post.authorAvatarUrl} name={detail.post.authorName ?? detail.raw.authorLogin} size={40} />
              <div className="min-w-0">
                <Link href={`/u/${detail.raw.authorLogin}`} className="font-medium hover:text-[var(--color-accent)]">
                  {detail.post.authorName ?? detail.raw.authorLogin}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1">
                  <RoleBadge role={detail.post.authorRole} />
                  {detail.raw.author.affiliation && (
                    <span className="text-[0.7rem] text-[var(--color-ink-faint)]">{detail.raw.author.affiliation}</span>
                  )}
                </div>
              </div>
            </div>
            {detail.raw.author.bio && (
              <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--color-ink-soft)]">{detail.raw.author.bio}</p>
            )}
          </section>

          <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
            <p className="label">数据</p>
            <dl className="mt-2 space-y-1.5 text-[0.78rem]">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-ink-faint)]">语言对</dt>
                <dd>{languagePairLabel(detail.raw.sourceLang, detail.raw.targetLang)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-ink-faint)]">领域</dt>
                <dd>{domainName(detail.raw.domain)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-ink-faint)]">票数</dt>
                <dd className="mono">+{detail.votes.upvotes} / −{detail.votes.downvotes}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-ink-faint)]">最后活动</dt>
                <dd>{timeAgo(detail.raw.lastActivityAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-ink-faint)]">GitHub 同步</dt>
                <dd>{timeAgo(detail.raw.syncedAt)}</dd>
              </div>
            </dl>
          </section>

          {detail.revisions.length > 1 && (
            <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
              <p className="label">修订记录</p>
              <ul className="mt-2 space-y-1.5 text-[0.72rem] text-[var(--color-ink-soft)]">
                {detail.revisions.slice(0, 5).map((revision) => (
                  <li key={revision.id} className="flex justify-between gap-2">
                    <span>{revision.source === "GITHUB" ? "GitHub 编辑" : "站内编辑"}</span>
                    <span className="mono text-[0.66rem] text-[var(--color-ink-faint)]">{formatDate(revision.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {related.length > 0 && (
            <section>
              <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1rem] font-semibold">同领域讨论</h2>
              <ul className="mt-2 space-y-2 text-[0.78rem]">
                {related.map((post) => (
                  <li key={post.id}>
                    <Link href={`/posts/${post.id}`} className="link-quiet">
                      <span className="font-medium text-[var(--color-ink)]">{post.term}</span>
                      <span className="ml-1 text-[var(--color-ink-faint)]">{post.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.raw.githubIssueUrl && (
            <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4 text-[0.74rem]">
              <p className="flex items-center gap-1.5 font-medium">
                <GitBranch className="h-3.5 w-3.5" aria-hidden />
                GitHub 记录
              </p>
              <p className="mt-1.5 leading-relaxed text-[var(--color-ink-soft)]">
                这个帖子对应仓库里的一个 Issue。站内评论会以隐藏标记同步过去，GitHub 上的新评论也会被同步回来。
              </p>
              <a
                href={detail.raw.githubIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 link-underline"
              >
                打开 Issue
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
