import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { POST_STATUS_LABELS, hasRole, type PostStatus } from "@/lib/constants";
import { getAdminOverview } from "@/lib/queries";
import { formatDateTime, timeAgo } from "@/lib/format";
import {
  moderatePostAction,
  resolveReportAction,
  syncNowAction,
} from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "审核台" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; synced?: string; posts?: string; comments?: string; glossary?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!hasRole(user.role, "MODERATOR")) redirect("/");

  const sp = await searchParams;
  const overview = await getAdminOverview();

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line)] pb-4">
        <div>
          <p className="label">审核台</p>
          <h1 className="mt-1 font-serif text-[1.8rem] font-semibold">待处理与同步状态</h1>
          <p className="mt-1 text-[0.76rem] text-[var(--color-ink-faint)]">
            {overview.postCount} 个帖子 · {overview.userCount} 位用户 · {overview.proposalCount} 个译法 · {overview.hiddenCount} 个被隐藏/驳回
          </p>
        </div>
        <form action={syncNowAction}>
          <button type="submit" className="btn btn-outline btn-sm">立即同步 GitHub</button>
        </form>
      </div>

      {sp.error && <div className="banner banner-error mt-4">{decodeURIComponent(sp.error)}</div>}
      {sp.synced && (
        <div className="banner banner-ok mt-4">
          同步完成：帖子 {sp.posts ?? "0"}，评论 {sp.comments ?? "0"}，术语库 {sp.glossary ?? "0"}。
          后台写队列也已处理一轮。
        </div>
      )}

      <div className="mt-7 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.1rem] font-semibold">
            待审核帖子 <span className="mono text-[0.72rem] font-normal text-[var(--color-ink-faint)]">{overview.pending.length}</span>
          </h2>
          {overview.pending.length === 0 ? (
            <p className="mt-3 text-[0.8rem] text-[var(--color-ink-faint)]">没有待审核帖子。</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--color-line)]">
              {overview.pending.map((post) => (
                <li key={post.id} className="py-3">
                  <Link href={`/posts/${post.id}`} className="font-serif text-[1rem] font-semibold hover:text-[var(--color-accent)]">
                    {post.term}
                  </Link>
                  <p className="mt-0.5 text-[0.78rem] text-[var(--color-ink-soft)]">{post.title}</p>
                  <p className="mt-0.5 text-[0.68rem] text-[var(--color-ink-faint)]">
                    @{post.authorLogin} · {timeAgo(post.createdAt)} · {POST_STATUS_LABELS[post.status as PostStatus] ?? post.status}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["approve", "hide", "reject"] as const).map((action) => (
                      <form key={action} action={moderatePostAction}>
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="action" value={action} />
                        <button type="submit" className={`btn btn-sm ${action === "approve" ? "btn-primary" : "btn-outline"}`}>
                          {action === "approve" ? "通过" : action === "hide" ? "隐藏" : "驳回"}
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.1rem] font-semibold">
            待处理举报 <span className="mono text-[0.72rem] font-normal text-[var(--color-ink-faint)]">{overview.reports.length}</span>
          </h2>
          {overview.reports.length === 0 ? (
            <p className="mt-3 text-[0.8rem] text-[var(--color-ink-faint)]">没有未处理举报。</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--color-line)]">
              {overview.reports.map((report) => (
                <li key={report.id} className="py-3 text-[0.8rem]">
                  <p>
                    <span className="font-medium">{report.reason}</span>
                    {report.post && (
                      <Link href={`/posts/${report.post.id}`} className="ml-2 link-underline">
                        {report.post.term}
                      </Link>
                    )}
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-[var(--color-ink-faint)]">
                    @{report.reporter?.login ?? "匿名"} · {timeAgo(report.createdAt)}
                    {report.detail && <span className="ml-1">· {report.detail}</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(["RESOLVED", "DISMISSED"] as const).map((resolution) => (
                      <form key={resolution} action={resolveReportAction} className="flex items-center gap-1">
                        <input type="hidden" name="reportId" value={report.id} />
                        <input type="hidden" name="resolution" value={resolution} />
                        <input name="note" maxLength={500} placeholder="处理说明（可选）" className="field h-8 w-40 text-[0.72rem]" />
                        <button type="submit" className="btn btn-outline btn-sm">
                          {resolution === "RESOLVED" ? "确认违规" : "驳回举报"}
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.1rem] font-semibold">GitHub 写队列</h2>
          {overview.writeJobs.length === 0 ? (
            <p className="mt-3 text-[0.8rem] text-[var(--color-ink-faint)]">队列为空。</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-[0.74rem]">
              {overview.writeJobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-line)] pb-1.5">
                  <span className="chip chip-mono">{job.kind}</span>
                  <span className="mono text-[0.68rem]">{job.status}</span>
                  <span className="text-[var(--color-ink-faint)]">attempts {job.attempts}</span>
                  {job.lastError && <span className="w-full text-[var(--color-accent)]">{job.lastError}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.1rem] font-semibold">同步事件</h2>
          <ul className="mt-2 space-y-1.5 text-[0.72rem]">
            {overview.syncEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-line)] pb-1.5">
                <span className="mono text-[0.66rem]">{event.eventName}</span>
                <span className={event.status === "FAILED" ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]"}>
                  {event.status}
                </span>
                <span className="text-[var(--color-ink-faint)]">{formatDateTime(event.receivedAt)}</span>
                {event.error && <span className="w-full text-[var(--color-accent)]">{event.error}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2">
          <h2 className="border-b border-[var(--color-line)] pb-2 font-serif text-[1.1rem] font-semibold">最近审计</h2>
          <ul className="mt-2 divide-y divide-[var(--color-line)] text-[0.74rem]">
            {overview.auditLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-baseline gap-2 py-1.5">
                <span className="mono text-[0.68rem]">{log.action}</span>
                <span className="text-[var(--color-ink-soft)]">{log.actorLogin ?? "system"}</span>
                <span className="text-[var(--color-ink-faint)]">{log.targetType}{log.targetId ? `:${log.targetId}` : ""}</span>
                <span className="ml-auto text-[0.66rem] text-[var(--color-ink-faint)]">{timeAgo(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
