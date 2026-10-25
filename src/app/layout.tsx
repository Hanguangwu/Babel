import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "Babel 译词论坛 · 讨论翻译术语",
    template: "%s · Babel 译词论坛",
  },
  description:
    "Babel 译词论坛：把翻译中拿不准的术语发出来，收集候选译法，投票、讨论，并把采纳结果沉淀为公开术语库。内容同步到 GitHub，可追溯。",
  openGraph: {
    title: "Babel 译词论坛",
    description: "一个词，值得被认真翻译。术语问题、候选译法与社区审校。",
    type: "website",
  },
};

const FOOTER_LINKS = [
  {
    title: "浏览",
    links: [
      { href: "/", label: "全部译词" },
      { href: "/domains", label: "领域" },
      { href: "/glossary", label: "术语库" },
      { href: "/rankings", label: "排行榜" },
      { href: "/search", label: "搜索" },
    ],
  },
  {
    title: "参与",
    links: [
      { href: "/submit", label: "发一个译词帖" },
      { href: "/login", label: "登录" },
      { href: "/admin", label: "审核台" },
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (e.g. Dark Reader) inject attributes on <html> before
    // hydration; suppress only that element's attribute diff.
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--color-ink)] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          跳到正文
        </a>
        <SiteHeader />
        <main id="main">{children}</main>

        <footer className="mt-20 border-t border-[var(--color-line)] bg-[var(--color-paper)]">
          <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-serif text-lg font-semibold">
                Babel<span className="text-[var(--color-accent)]">·</span>译词
              </p>
              <p className="mt-2 max-w-xs text-[0.78rem] leading-relaxed text-[var(--color-ink-soft)]">
                翻译里最难的不是句子，是那些看起来都对的词。这里用来把分歧讲清楚，并把结论留下来。
              </p>
            </div>
            {FOOTER_LINKS.map((group) => (
              <div key={group.title}>
                <p className="label">{group.title}</p>
                <ul className="mt-3 space-y-2 text-[0.8rem] text-[var(--color-ink-soft)]">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="hover:text-[var(--color-accent)]">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="label">数据来源</p>
              <ul className="mt-3 space-y-2 text-[0.8rem] text-[var(--color-ink-soft)]">
                <li>帖子与评论镜像到 GitHub Issue</li>
                <li>投票、审核与采纳记录存于本站</li>
                <li>采纳结果以 PR 形式进入术语库</li>
                <li>页面读取本地索引，不实时请求 GitHub</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[var(--color-line)]">
            <div className="container-page flex flex-wrap items-center justify-between gap-2 py-4 text-[0.68rem] text-[var(--color-ink-faint)]">
              <span>Babel 译词论坛 · 演示部署 · 内容为示例</span>
              <span>Next.js · Prisma · Neon · Vercel</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
