import type { Metadata } from "next";
import Link from "next/link";
import { DOMAINS } from "@/lib/constants";
import { getDomainsWithCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "领域" };

export default async function DomainsPage() {
  const domains = await getDomainsWithCounts();
  const groups = Array.from(new Set(DOMAINS.map((domain) => domain.group)));

  return (
    <div className="container-page py-8">
      <p className="label">领域</p>
      <h1 className="mt-2 font-serif text-[1.9rem] font-semibold">按使用场景浏览</h1>
      <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-[var(--color-ink-soft)]">
        同一个词在法律文本和字幕里可能是两个问题。先选领域，再选语言对，能更快找到可用的译法。
      </p>

      <div className="mt-8 space-y-9">
        {groups.map((group) => {
          const items = domains.filter((domain) => domain.group === group);
          return (
            <section key={group}>
              <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.1rem] font-semibold">{group}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((domain) => (
                  <Link
                    key={domain.slug}
                    href={`/domains/${domain.slug}`}
                    className="group border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4 transition-colors hover:border-[var(--color-line-strong)]"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif text-[1rem] font-semibold group-hover:text-[var(--color-accent)]">
                        {domain.name}
                      </span>
                      <span className="mono text-[0.7rem] text-[var(--color-ink-faint)]">{domain.count} 帖</span>
                    </div>
                    <p className="mt-1.5 text-[0.76rem] leading-relaxed text-[var(--color-ink-soft)]">
                      {domain.description}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
