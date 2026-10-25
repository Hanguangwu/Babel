import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContributorProfile } from "@/lib/queries";
import { formatDate, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { ProposalStatusBadge, RoleBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ login: string }>;
}): Promise<Metadata> {
  const { login } = await params;
  return { title: `@${login}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const profile = await getContributorProfile(login);
  if (!profile.found) notFound();

  return (
    <div className="container-page py-8">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
        <div>
          <header className="flex items-start gap-4 border-b border-[var(--color-line)] pb-5">
            <Avatar src={profile.avatarUrl} name={profile.name ?? profile.login} size={56} />
            <div className="min-w-0">
              <h1 className="font-serif text-[1.7rem] font-semibold leading-tight">
                {profile.name ?? profile.login}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.78rem] text-[var(--color-ink-faint)]">
                <Link href={`https://github.com/${profile.login}`} className="link-quiet mono" target="_blank" rel="noopener noreferrer">
                  @{profile.login}
                </Link>
                <RoleBadge role={profile.role} />
                {profile.affiliation && <span>{profile.affiliation}</span>}
              </p>
              {profile.bio && (
                <p className="mt-2 max-w-xl text-[0.84rem] leading-relaxed text-[var(--color-ink-soft)]">{profile.bio}</p>
              )}
            </div>
          </header>

          <section className="mt-6">
            <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.05rem] font-semibold">
              发起的帖子 <span className="mono text-[0.72rem] font-normal text-[var(--color-ink-faint)]">{profile.posts.length}</span>
            </h2>
            {profile.posts.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="还没有发过帖子"
                  description="第一个术语问题通常来自正在做的稿件。把它贴出来，比继续自己纠结更快。"
                  action={{ href: "/submit", label: "发一个译词帖" }}
                />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {profile.posts.map((post) => (
                  <li key={post.id} className="py-3">
                    <Link href={`/posts/${post.id}`} className="group">
                      <p className="flex flex-wrap items-baseline gap-2">
                        <span className="font-serif text-[1rem] font-semibold group-hover:text-[var(--color-accent)]">
                          {post.term}
                        </span>
                        <span className="text-[0.82rem] text-[var(--color-ink-soft)]">{post.title}</span>
                      </p>
                      <p className="mt-0.5 text-[0.68rem] text-[var(--color-ink-faint)]">
                        {formatDate(post.publishedAt ?? post.createdAt)} · {post.proposalCount} 个译法 · {post.commentCount} 条讨论
                        {post.acceptedTranslation && <span className="ml-2 text-[var(--color-moss)]">定译：{post.acceptedTranslation}</span>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.05rem] font-semibold">
              提出的译法 <span className="mono text-[0.72rem] font-normal text-[var(--color-ink-faint)]">{profile.proposals.length}</span>
            </h2>
            {profile.proposals.length === 0 ? (
              <p className="mt-3 text-[0.82rem] text-[var(--color-ink-faint)]">还没有提交过译法。</p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {profile.proposals.map((proposal) => (
                  <li key={proposal.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/posts/${proposal.postId}#proposal-${proposal.id}`} className="font-medium hover:text-[var(--color-accent)]">
                        {proposal.translation}
                      </Link>
                      <ProposalStatusBadge status={proposal.status} />
                      <span className="mono text-[0.68rem] text-[var(--color-ink-faint)]">+{proposal.upvotes} / −{proposal.downvotes}</span>
                    </div>
                    <p className="mt-0.5 text-[0.72rem] text-[var(--color-ink-faint)]">
                      用于「{proposal.post.term}」· {timeAgo(proposal.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
            <p className="label">统计</p>
            <dl className="mt-2 space-y-2 text-[0.8rem]">
              <div className="flex justify-between"><dt className="text-[var(--color-ink-faint)]">帖子</dt><dd className="mono">{profile.stats.posts}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--color-ink-faint)]">净票数</dt><dd className="mono">{profile.stats.score}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--color-ink-faint)]">译法</dt><dd className="mono">{profile.stats.proposals}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--color-ink-faint)]">被采纳</dt><dd className="mono">{profile.stats.accepted}</dd></div>
            </dl>
          </section>
          <section className="border-l-2 border-[var(--color-line-strong)] pl-4 text-[0.74rem] leading-relaxed text-[var(--color-ink-soft)]">
            被采纳的译法会进入术语库，并标记采纳人。统计数据来自站内投票，与 GitHub reactions 无关。
          </section>
        </aside>
      </div>
    </div>
  );
}
