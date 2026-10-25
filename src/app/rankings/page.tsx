import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboards } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { RoleBadge } from "@/components/badges";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "排行榜" };

export default async function RankingsPage() {
  const boards = await getLeaderboards();

  const sections = [
    { key: "hot", title: "正在升温", note: "按热度分排序，随投票与讨论衰减", items: boards.hot },
    { key: "top", title: "最高票", note: "累计净票数", items: boards.top },
    { key: "discussed", title: "讨论最多", note: "候选译法数量优先", items: boards.discussed },
    { key: "recent", title: "最新发布", note: "刚刚进入讨论区", items: boards.recent },
  ] as const;

  return (
    <div className="container-page py-8">
      <p className="label">排行榜</p>
      <h1 className="mt-2 font-serif text-[1.9rem] font-semibold">哪些词值得先看</h1>
      <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-[var(--color-ink-soft)]">
        热度不是“最正确”，只是“现在最多人在想”。真正定下来的译法在术语库里。
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
        <div className="space-y-9">
          {sections.map((section) => (
            <section key={section.key}>
              <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
                <h2 className="font-serif text-[1.1rem] font-semibold">{section.title}</h2>
                <p className="text-[0.68rem] text-[var(--color-ink-faint)]">{section.note}</p>
              </div>
              <ol className="divide-y divide-[var(--color-line)]">
                {section.items.map((post, index) => (
                  <li key={post.id} className="flex gap-3 py-2.5">
                    <span className="mono w-5 pt-0.5 text-right text-[0.72rem] text-[var(--color-ink-faint)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/posts/${post.id}`} className="group">
                        <span className="font-serif text-[0.98rem] font-semibold group-hover:text-[var(--color-accent)]">
                          {post.term}
                        </span>
                        <span className="ml-2 text-[0.8rem] text-[var(--color-ink-soft)]">{post.title}</span>
                      </Link>
                      <p className="mt-0.5 flex flex-wrap gap-2 text-[0.66rem] text-[var(--color-ink-faint)]">
                        <span>+{post.upvotes} / −{post.downvotes}</span>
                        <span>{post.proposalCount} 个译法</span>
                        <span>{post.commentCount} 条讨论</span>
                        <span>{timeAgo(post.publishedAt ?? post.createdAt)}</span>
                        {post.acceptedTranslation && <span className="text-[var(--color-moss)]">定译：{post.acceptedTranslation}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <aside>
          <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.05rem] font-semibold">贡献者</h2>
          <ol className="mt-3 space-y-3">
            {boards.contributors.map((person, index) => (
              <li key={person.login} className="flex items-start gap-2.5">
                <span className="mono w-4 pt-1 text-[0.68rem] text-[var(--color-ink-faint)]">{index + 1}</span>
                <Avatar src={person.avatarUrl} name={person.name ?? person.login} size={28} />
                <div className="min-w-0">
                  <Link href={`/u/${person.login}`} className="text-[0.82rem] font-medium hover:text-[var(--color-accent)]">
                    {person.name ?? person.login}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <RoleBadge role={person.role} />
                    <span className="text-[0.64rem] text-[var(--color-ink-faint)]">
                      {person.postCount} 帖 · {person.proposalCount} 译法 · {person.acceptedCount} 采纳
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
