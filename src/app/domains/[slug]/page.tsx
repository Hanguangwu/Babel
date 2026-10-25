import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DOMAIN_MAP, isSortKey, type SortKey } from "@/lib/constants";
import { listPosts } from "@/lib/queries";
import { EmptyState } from "@/components/empty-state";
import { PostRow } from "@/components/post-row";
import { SortTabs } from "@/components/sort-tabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const domain = DOMAIN_MAP.get(slug);
  return { title: domain ? `${domain.name} · 领域` : "领域" };
}

export default async function DomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; cursor?: string; lang?: string }>;
}) {
  const { slug } = await params;
  const domain = DOMAIN_MAP.get(slug);
  if (!domain) notFound();

  const sp = await searchParams;
  const sort: SortKey = isSortKey(sp.sort) ? sp.sort : "hot";
  const list = await listPosts({
    domain: slug,
    sort,
    cursor: sp.cursor,
    sourceLang: sp.lang,
    limit: 15,
  });

  const nextHref = list.nextCursor
    ? `/domains/${slug}?${new URLSearchParams({ ...(sort !== "hot" ? { sort } : {}), ...(sp.lang ? { lang: sp.lang } : {}), cursor: list.nextCursor }).toString()}`
    : null;

  return (
    <div className="container-page py-6">
      <div className="border-b border-[var(--color-line)] pb-6">
        <p className="label">
          <Link href="/domains" className="hover:text-[var(--color-accent)]">领域</Link> / {domain.group}
        </p>
        <h1 className="mt-2 font-serif text-[1.9rem] font-semibold">{domain.name}</h1>
        <p className="mt-2 max-w-2xl text-[0.87rem] leading-relaxed text-[var(--color-ink-soft)]">
          {domain.description}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line)]">
        <SortTabs active={sort} basePath={`/domains/${slug}`} params={{ lang: sp.lang }} />
        <p className="pb-2 text-[0.72rem] text-[var(--color-ink-faint)]">{list.total} 个帖子</p>
      </div>

      {list.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={`${domain.name}领域还没有帖子`}
            description="如果你手里正好有一个卡住的术语，这个领域的第一条讨论就从它开始。"
            action={{ href: `/submit?domain=${domain.slug}`, label: "发一个译词帖" }}
          />
        </div>
      ) : (
        <div className="mt-1">
          {list.items.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </div>
      )}

      {nextHref && (
        <div className="mt-6 flex justify-center">
          <Link href={nextHref} className="btn btn-outline btn-sm">
            下一页
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
