import Link from "next/link";
import { Search, PenLine } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { hasRole, isRole, ROLE_LABELS } from "@/lib/constants";
import { Avatar } from "./avatar";

const NAV = [
  { href: "/", label: "全部译词" },
  { href: "/domains", label: "领域" },
  { href: "/glossary", label: "术语库" },
  { href: "/rankings", label: "排行榜" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--color-paper)]/95 backdrop-blur-sm">
      <div className="hidden border-b border-[var(--color-line)] sm:block">
        <div className="container-page flex h-7 items-center justify-between text-[0.68rem] text-[var(--color-ink-faint)]">
          <span>译词讨论在站内进行，正文与评论同步到 GitHub Issue，可追溯、可导出</span>
          <span className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-moss)]" aria-hidden />
            术语库由社区审校
          </span>
        </div>
      </div>

      <div className="container-page flex h-14 items-center gap-3 sm:gap-5">
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5" aria-label="Babel 译词论坛首页">
          <span className="font-serif text-[1.4rem] font-semibold leading-none tracking-tight">
            Babel<span className="text-[var(--color-accent)]">·</span>译词
          </span>
          <span className="hidden text-[0.6rem] font-medium uppercase tracking-[0.16em] text-[var(--color-ink-faint)] sm:inline">
            terms
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-[0.83rem] text-[var(--color-ink-soft)]">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded px-2 py-1.5 hover:bg-[var(--color-paper-sunk)] hover:text-[var(--color-ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form action="/search" role="search" className="ml-auto hidden min-w-0 flex-1 items-center justify-end md:flex lg:max-w-xs">
          <label className="relative flex w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-faint)]" aria-hidden />
            <input
              type="search"
              name="q"
              placeholder="搜索术语、译法或讨论"
              aria-label="搜索术语、译法或讨论"
              className="field search-field h-9 w-full text-[0.8rem]"
            />
          </label>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <Link href="/submit" className="btn btn-accent btn-sm">
            <PenLine className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">发译词帖</span>
            <span className="sm:hidden">发帖</span>
          </Link>

          {user ? (
            <>
              {hasRole(user.role, "MODERATOR") && (
                <Link
                  href="/admin"
                  className="hidden rounded px-2 py-1.5 text-[0.8rem] text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-sunk)] sm:inline"
                >
                  审核台
                </Link>
              )}
              <Link
                href={`/u/${user.login}`}
                className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[var(--color-paper-sunk)]"
                title={`${user.name ?? user.login} · ${isRole(user.role) ? ROLE_LABELS[user.role] : user.role}`}
              >
                <Avatar src={user.avatarUrl} name={user.name ?? user.login} size={26} />
                <span className="hidden text-[0.8rem] font-medium lg:inline">{user.name ?? user.login}</span>
              </Link>
              <form action="/api/v1/auth/logout" method="post">
                <button type="submit" className="rounded px-2 py-1.5 text-[0.78rem] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
                  退出
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn btn-outline btn-sm">
              <span className="hidden sm:inline">使用 GitHub 登录</span>
              <span className="sm:hidden">登录</span>
            </Link>
          )}
        </div>
      </div>

      <div className="container-page pb-2 md:hidden">
        <form action="/search" role="search" className="flex">
          <label className="relative flex w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-faint)]" aria-hidden />
            <input
              type="search"
              name="q"
              placeholder="搜索术语、译法或讨论"
              aria-label="搜索"
              className="field search-field h-9 w-full text-[0.8rem]"
            />
          </label>
        </form>
      </div>
    </header>
  );
}
