import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="label">404</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold">没有找到这个词</h1>
      <p className="mt-3 max-w-md text-[0.88rem] leading-relaxed text-[var(--color-ink-soft)]">
        页面可能已被合并、隐藏，或者链接里的编号不完整。可以回到列表重新搜索，也可以直接发一个新帖。
      </p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="btn btn-primary btn-sm">
          回到全部译词
        </Link>
        <Link href="/submit" className="btn btn-outline btn-sm">
          发一个译词帖
        </Link>
      </div>
    </div>
  );
}
