import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { DOMAINS, LANGUAGES, languageName } from "@/lib/constants";
import { searchEverything } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "搜索" };

const KIND_LABELS = {
  post: "帖子",
  proposal: "译法",
  comment: "评论",
} as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; domain?: string; lang?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const domain = sp.domain || undefined;
  const lang = sp.lang || undefined;
  const type = sp.type || "all";

  const results = q ? await searchEverything(q) : null;
  const sections = results
    ? ([
        ["post", results.posts],
        ["proposal", results.proposals],
        ["comment", results.comments],
      ] as const).filter(([kind, items]) => (type === "all" || type === kind) && items.length > 0)
    : [];

  return (
    <div className="container-page py-8">
      <p className="label">搜索</p>
      <h1 className="mt-2 font-serif text-[1.9rem] font-semibold">在术语、译法与讨论里找</h1>

      <form className="mt-5 flex flex-wrap gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="术语、译法、评论里的原文"
            aria-label="搜索关键词"
            className="field search-field h-10"
          />
        </label>
        <select name="domain" defaultValue={domain ?? ""} aria-label="领域" className="field h-10 w-auto">
          <option value="">全部领域</option>
          {DOMAINS.map((item) => (
            <option key={item.slug} value={item.slug}>{item.name}</option>
          ))}
        </select>
        <select name="lang" defaultValue={lang ?? ""} aria-label="源语言" className="field h-10 w-auto">
          <option value="">全部源语言</option>
          {LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>{item.name}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">搜索</button>
      </form>

      {!q ? (
        <div className="mt-8">
          <EmptyState
            title="输入一个词开始"
            description="可以搜术语原文、中文译法、评论里的句子。找不到时，直接发帖往往比继续换关键词更快。"
            action={{ href: "/submit", label: "发一个译词帖" }}
          />
        </div>
      ) : (
        <div className="mt-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-line)] pb-2">
            <p className="text-[0.85rem]">
              “{q}” 找到 <span className="mono">{results?.total ?? 0}</span> 条结果
              {lang && <span className="ml-2 text-[0.72rem] text-[var(--color-ink-faint)]">源语言：{languageName(lang)}</span>}
              {domain && <span className="ml-2 text-[0.72rem] text-[var(--color-ink-faint)]">领域：{domain}</span>}
            </p>
            <div className="tabs">
              {(["all", "post", "proposal", "comment"] as const).map((value) => (
                <Link
                  key={value}
                  href={`/search?${new URLSearchParams({ q, ...(value !== "all" ? { type: value } : {}), ...(domain ? { domain } : {}), ...(lang ? { lang } : {}) }).toString()}`}
                  className="tab"
                  data-active={type === value}
                >
                  {value === "all" ? "全部" : KIND_LABELS[value]}
                </Link>
              ))}
            </div>
          </div>

          {sections.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="没有匹配的结果"
                description="可能是关键词太窄，也可能这个词还没有人讨论过。发一个帖子把语境写出来，通常更快。"
                action={{ href: "/submit", label: "发一个译词帖" }}
              />
            </div>
          ) : (
            <div className="mt-4 space-y-8">
              {sections.map(([kind, items]) => (
                <section key={kind}>
                  <h2 className="font-serif text-[1.05rem] font-semibold">
                    {KIND_LABELS[kind]} <span className="mono text-[0.72rem] font-normal text-[var(--color-ink-faint)]">{items.length}</span>
                  </h2>
                  <ul className="mt-2 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
                    {items.map((hit, index) => (
                      <li key={`${hit.postId}-${kind}-${index}`} className="py-3">
                        <Link href={`/posts/${hit.postId}`} className="group block">
                          <p className="flex flex-wrap items-baseline gap-2">
                            <span className="font-serif text-[1rem] font-semibold group-hover:text-[var(--color-accent)]">
                              {hit.postTerm}
                            </span>
                            <span className="text-[0.82rem] text-[var(--color-ink-soft)]">{hit.postTitle}</span>
                          </p>
                          <p className="clamp-2 mt-1 text-[0.8rem] leading-relaxed text-[var(--color-ink-soft)]">
                            {hit.snippet}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-2 text-[0.68rem] text-[var(--color-ink-faint)]">
                            <span>{hit.matchedIn.join(" · ")}</span>
                            {hit.author && <span>@{hit.author}</span>}
                            <span>{timeAgo(hit.publishedAt)}</span>
                            <span>{hit.commentCount} 条讨论</span>
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
