import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { DOMAINS, LANGUAGES, domainName, languageName } from "@/lib/constants";
import { listGlossary } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "术语库" };

export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; domain?: string; lang?: string; targetLang?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const domain = sp.domain || undefined;
  const sourceLang = sp.lang || undefined;
  const targetLang = sp.targetLang || undefined;

  const result = await listGlossary({
    query: q,
    domain,
    sourceLang,
    targetLang,
    cursor: sp.cursor,
    limit: 30,
  });

  const nextHref = result.nextCursor
    ? `/glossary?${new URLSearchParams({
        ...(q ? { q } : {}),
        ...(domain ? { domain } : {}),
        ...(sourceLang ? { lang: sourceLang } : {}),
        ...(targetLang ? { targetLang } : {}),
        cursor: result.nextCursor,
      }).toString()}`
    : null;

  return (
    <div className="container-page py-8">
      <p className="label">术语库</p>
      <h1 className="mt-2 font-serif text-[1.9rem] font-semibold">已经定下来的译法</h1>
      <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-[var(--color-ink-soft)]">
        每一条都对应一次公开讨论与一次采纳决定。术语库只收已采纳的译法，条目以 Markdown 存在内容仓库，
        通过 PR 更新，不覆盖历史。
      </p>

      <form className="mt-5 flex flex-wrap gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="搜索术语或译法"
            aria-label="搜索术语或译法"
            className="field search-field h-10"
          />
        </label>
        <select name="domain" defaultValue={domain ?? ""} aria-label="领域" className="field h-10 w-auto">
          <option value="">全部领域</option>
          {DOMAINS.map((item) => (
            <option key={item.slug} value={item.slug}>{item.name}</option>
          ))}
        </select>
        <select name="lang" defaultValue={sourceLang ?? ""} aria-label="源语言" className="field h-10 w-auto">
          <option value="">源语言</option>
          {LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>{item.name}</option>
          ))}
        </select>
        <select name="targetLang" defaultValue={targetLang ?? ""} aria-label="目标语言" className="field h-10 w-auto">
          <option value="">目标语言</option>
          {LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>{item.name}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">筛选</button>
      </form>

      <p className="mt-4 text-[0.72rem] text-[var(--color-ink-faint)]">
        {result.total} 个条目
        {(q || domain || sourceLang || targetLang) && (
          <Link href="/glossary" className="ml-2 link-underline">清除筛选</Link>
        )}
      </p>

      {result.items.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="术语库还没有匹配的条目"
            description="术语库只收已采纳的译法。可以先去帖子列表看看正在讨论的问题，或在某个帖子里投出你支持的译法。"
            action={{ href: "/", label: "浏览讨论" }}
          />
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto border-y border-[var(--color-line)]">
          <table className="w-full min-w-[42rem] border-collapse text-left text-[0.82rem]">
            <thead>
              <tr className="border-b border-[var(--color-line)] bg-[var(--color-paper-sunk)] text-[0.68rem] uppercase tracking-wide text-[var(--color-ink-faint)]">
                <th className="px-3 py-2 font-medium">原文</th>
                <th className="px-3 py-2 font-medium">译法</th>
                <th className="px-3 py-2 font-medium">语言对</th>
                <th className="px-3 py-2 font-medium">领域</th>
                <th className="px-3 py-2 font-medium">采纳</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((entry) => (
                <tr key={entry.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                  <td className="px-3 py-2.5 font-serif text-[0.95rem] font-medium">{entry.term}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{entry.translation}</span>
                    {entry.rationaleMarkdown && (
                      <p className="clamp-2 mt-0.5 max-w-md text-[0.72rem] leading-relaxed text-[var(--color-ink-faint)]">
                        {entry.rationaleMarkdown}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[0.75rem] text-[var(--color-ink-soft)]">
                    {languageName(entry.sourceLang)} → {languageName(entry.targetLang)}
                  </td>
                  <td className="px-3 py-2.5 text-[0.75rem] text-[var(--color-ink-soft)]">{domainName(entry.domain)}</td>
                  <td className="px-3 py-2.5 text-[0.72rem] text-[var(--color-ink-faint)]">
                    {formatDate(entry.acceptedAt)}
                    {entry.acceptedByLogin && <span className="ml-1">@{entry.acceptedByLogin}</span>}
                    {entry.postId && (
                      <Link href={`/posts/${entry.postId}`} className="ml-1 block link-underline">
                        讨论
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextHref && (
        <div className="mt-6 flex justify-center">
          <Link href={nextHref} className="btn btn-outline btn-sm">下一页</Link>
        </div>
      )}
    </div>
  );
}
