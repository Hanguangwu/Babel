import Link from "next/link";
import { ArrowRight, GitBranch, Search } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { isSortKey, languagePairLabel, type SortKey } from "@/lib/constants";
import {
  getDomainsWithCounts,
  getLanguagePairs,
  getStats,
  getTopContributors,
  listPosts,
} from "@/lib/queries";
import { compactNumber } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { PostRow } from "@/components/post-row";
import { SortTabs } from "@/components/sort-tabs";

export const dynamic = "force-dynamic";

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; domain?: string; lang?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const domain = sp.domain || undefined;
  const sourceLang = sp.lang || undefined;
  const sort: SortKey = isSortKey(sp.sort) ? sp.sort : "hot";

  const [list, stats, domains, pairs, contributors, user] = await Promise.all([
    listPosts({ query: q, domain, sourceLang, sort, cursor: sp.cursor, limit: 12 }),
    getStats(),
    getDomainsWithCounts(),
    getLanguagePairs(8),
    getTopContributors(6),
    getCurrentUser(),
  ]);

  const activeDomains = domains.filter((item) => item.count > 0).slice(0, 10);
  const nextHref = list.nextCursor
    ? `/?${buildQuery({ q, sort, domain, lang: sourceLang, cursor: list.nextCursor ?? undefined })}`
    : null;

  return (
    <div>
      <section className="border-b border-[var(--color-line)]">
        <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end lg:gap-16 lg:py-14">
          <div>
            <p className="label">译词论坛</p>
            <h1 className="mt-2 max-w-2xl font-serif text-[2.1rem] font-semibold leading-[1.2] tracking-tight sm:text-[2.6rem]">
              一个词，值得被认真翻译。
            </h1>
            <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-[var(--color-ink-soft)]">
              把拿不准的术语、有争议的译法、找不到出处的对应词发出来。社区给出候选译法，投票与讨论都留下理由，
              最后由版主采纳并沉淀进公开术语库。
            </p>

            <form action="/" className="mt-6 flex max-w-xl gap-2" role="search">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]" aria-hidden />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="例如：consideration、检索增强生成、まちづくり"
                  aria-label="搜索术语"
                  className="field search-field h-10"
                />
              </label>
              <button type="submit" className="btn btn-primary">
                搜索
              </button>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-[0.74rem] text-[var(--color-ink-faint)]">
              <span>试搜：</span>
              {["对价", "RAG", "考虑", "本地化"].map((term) => (
                <Link key={term} href={`/?q=${encodeURIComponent(term)}`} className="chip">
                  {term}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-[var(--color-line)] pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {[
              { label: "术语帖", value: stats.posts },
              { label: "候选译法", value: stats.proposals },
              { label: "术语库条目", value: stats.glossary },
            ].map((item) => (
              <div key={item.label}>
                <p className="stat-number">{compactNumber(item.value)}</p>
                <p className="mt-1 text-[0.7rem] text-[var(--color-ink-faint)]">{item.label}</p>
              </div>
            ))}
            <p className="col-span-3 mt-1 text-[0.7rem] leading-relaxed text-[var(--color-ink-faint)]">
              {stats.contributors} 位译者参与，{stats.domains} 个领域有讨论。
              {stats.lastSyncAt ? "索引每天与 GitHub 对账。" : "尚未连接 GitHub 仓库。"}
            </p>
          </div>
        </div>
      </section>

      <div className="container-page grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line)]">
            <SortTabs active={sort} basePath="/" params={{ q, domain, lang: sourceLang }} />
            <p className="pb-2 text-[0.72rem] text-[var(--color-ink-faint)]">
              {list.total} 个帖子
              {(q || domain || sourceLang) && (
                <Link href="/" className="ml-2 link-underline">
                  清除筛选
                </Link>
              )}
            </p>
          </div>

          {(q || domain || sourceLang) && (
            <div className="mt-3 flex flex-wrap gap-2 text-[0.72rem] text-[var(--color-ink-faint)]">
              {q && <span className="chip chip-accent">关键词：{q}</span>}
              {domain && <span className="chip chip-accent">领域：{domain}</span>}
              {sourceLang && <span className="chip chip-accent">语言：{sourceLang}</span>}
            </div>
          )}

          <div className="mt-1">
            {list.items.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  title={q ? `没有找到与“${q}”相关的帖子` : "还没有译词帖"}
                  description={
                    q
                      ? "可以换一个关键词，或直接把这个词发成新帖，请社区给出译法。"
                      : "第一个帖子通常最难写。只要写清楚原文、语境和你犹豫的地方，就已经足够。"
                  }
                  action={user ? { href: "/submit", label: "发一个译词帖" } : { href: "/login", label: "登录后发帖" }}
                />
              </div>
            ) : (
              list.items.map((post) => <PostRow key={post.id} post={post} />)
            )}
          </div>

          {nextHref && (
            <div className="mt-6 flex justify-center">
              <Link href={nextHref} className="btn btn-outline btn-sm">
                下一页
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </div>

        <aside className="space-y-7">
          <section>
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1rem] font-semibold">活跃领域</h2>
              <Link href="/domains" className="text-[0.7rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
                全部
              </Link>
            </div>
            <ul className="mt-2 space-y-1.5 text-[0.8rem]">
              {(activeDomains.length > 0 ? activeDomains : domains.slice(0, 8)).map((item) => (
                <li key={item.slug} className="flex items-center justify-between gap-2">
                  <Link href={`/domains/${item.slug}`} className="link-quiet truncate">
                    {item.name}
                  </Link>
                  <span className="mono text-[0.68rem] text-[var(--color-ink-faint)]">{item.count}</span>
                </li>
              ))}
            </ul>
          </section>

          {pairs.length > 0 && (
            <section>
              <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1rem] font-semibold">
                热门语言对
              </h2>
              <ul className="mt-2 space-y-1.5 text-[0.8rem]">
                {pairs.map((pair) => (
                  <li key={`${pair.sourceLang}-${pair.targetLang}`} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/?lang=${pair.sourceLang}`}
                      className="link-quiet truncate"
                    >
                      {languagePairLabel(pair.sourceLang, pair.targetLang)}
                    </Link>
                    <span className="mono text-[0.68rem] text-[var(--color-ink-faint)]">{pair.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
              <h2 className="font-serif text-[1rem] font-semibold">贡献者</h2>
              <Link href="/rankings" className="text-[0.7rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
                榜单
              </Link>
            </div>
            <ul className="mt-2 space-y-2 text-[0.78rem]">
              {contributors.map((person) => (
                <li key={person.login} className="flex items-center justify-between gap-2">
                  <Link href={`/u/${person.login}`} className="link-quiet truncate">
                    {person.name ?? person.login}
                  </Link>
                  <span className="mono text-[0.66rem] text-[var(--color-ink-faint)]">
                    {person.acceptedCount} 采纳
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
            <p className="flex items-center gap-1.5 text-[0.78rem] font-medium">
              <GitBranch className="h-3.5 w-3.5 text-[var(--color-ink-soft)]" aria-hidden />
              GitHub 是审计记录
            </p>
            <p className="mt-1.5 text-[0.72rem] leading-relaxed text-[var(--color-ink-soft)]">
              每个帖子对应一个 Issue，评论双向同步；采纳的译法会以 PR 形式写入术语库仓库。
              页面读取本地索引，所以不会因为 GitHub 暂时不可用而打不开。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
