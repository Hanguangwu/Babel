import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GitBranch } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { DOMAINS, LANGUAGES, hasRole } from "@/lib/constants";
import { createPostAction } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "发一个译词帖" };

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");
  const { error } = await searchParams;

  const groups = Array.from(new Set(DOMAINS.map((domain) => domain.group)));
  const trusted = hasRole(user.role, "CONTRIBUTOR");

  return (
    <div className="container-page py-8">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
        <div>
          <p className="label">新帖</p>
          <h1 className="mt-2 font-serif text-[1.9rem] font-semibold leading-tight">把问题问清楚</h1>
          <p className="mt-2 max-w-xl text-[0.88rem] leading-relaxed text-[var(--color-ink-soft)]">
            一个帖子只讨论一个术语。写清楚原文、语言对、领域，以及你遇到的真实句子——
            这比“应该怎么翻译”更容易得到有用的回答。
          </p>

          {error && <div className="banner banner-error mt-5">{decodeURIComponent(error)}</div>}

          <form action={createPostAction} className="mt-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="term" className="label">术语原文 *</label>
                <input
                  id="term"
                  name="term"
                  required
                  maxLength={120}
                  placeholder="consideration"
                  className="field mt-1 font-serif text-[1rem]"
                />
              </div>
              <div>
                <label htmlFor="title" className="label">一句话说明问题 *</label>
                <input
                  id="title"
                  name="title"
                  required
                  minLength={4}
                  maxLength={160}
                  placeholder="合同价款条款里的 consideration 该译成什么？"
                  className="field mt-1"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sourceLang" className="label">源语言 *</label>
                <select id="sourceLang" name="sourceLang" required defaultValue="en" className="field mt-1">
                  {LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}（{language.code}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="targetLang" className="label">目标语言 *</label>
                <select id="targetLang" name="targetLang" required defaultValue="zh-CN" className="field mt-1">
                  {LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}（{language.code}）
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="domain" className="label">领域 *</label>
              <select id="domain" name="domain" required defaultValue="general" className="field mt-1">
                {groups.map((group) => (
                  <optgroup key={group} label={group}>
                    {DOMAINS.filter((domain) => domain.group === group).map((domain) => (
                      <option key={domain.slug} value={domain.slug}>
                        {domain.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="context" className="label">语境 *</label>
              <textarea
                id="context"
                name="context"
                required
                rows={6}
                minLength={10}
                maxLength={8000}
                placeholder={"贴出原句，并说明上下文：\n\n> The parties agree that the consideration for the Services shall be paid monthly.\n\n这是一份服务合同，价款条款。译者把 consideration 译成“考虑”，客户认为不对。"}
                className="field mt-1 text-[0.9rem]"
              />
              <p className="mt-1 text-[0.68rem] text-[var(--color-ink-faint)]">
                支持 Markdown。可以贴原文、注明出处、说明文体与读者。
              </p>
            </div>

            <div>
              <label htmlFor="body" className="label">补充说明（可选）</label>
              <textarea
                id="body"
                name="body"
                rows={4}
                maxLength={20000}
                placeholder="你已经试过哪些译法？为什么觉得不合适？"
                className="field mt-1 text-[0.9rem]"
              />
            </div>

            <div className="border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4 text-[0.75rem] leading-relaxed text-[var(--color-ink-soft)]">
              <p className="flex items-center gap-1.5 font-medium text-[var(--color-ink)]">
                <GitBranch className="h-3.5 w-3.5" aria-hidden />
                发布后会发生什么
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>帖子先写入本站数据库，页面立即可见{trusted ? "（你的角色可直接发布）" : "（新用户需版主审核后公开）"}。</li>
                <li>后台队列会创建一个 GitHub Issue 作为公开记录，不需要你等待网络请求。</li>
                <li>评论、译法与采纳结果都会同步过去；术语库只接受已采纳的译法。</li>
              </ul>
            </div>

            <div className="flex items-center gap-2">
              <button type="submit" className="btn btn-accent">发布帖子</button>
              <Link href="/" className="btn btn-quiet">取消</Link>
            </div>
          </form>
        </div>

        <aside className="space-y-5 text-[0.78rem] leading-relaxed text-[var(--color-ink-soft)]">
          <section className="border-l-2 border-[var(--color-accent)] pl-4">
            <p className="font-medium text-[var(--color-ink)]">什么样的帖子容易得到回答</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>原文完整，不是孤零零一个词。</li>
              <li>说明了文体：合同、论文、字幕、说明书，译法要求不同。</li>
              <li>写清楚你已经排除了哪些译法，以及为什么。</li>
            </ul>
          </section>
          <section>
            <p className="font-medium text-[var(--color-ink)]">标题写法</p>
            <p className="mt-1">好标题是问题的浓缩，不是术语的重复。例如“专利权利要求里的 comprising 应译‘包括’还是‘包含’”。</p>
          </section>
          <section>
            <p className="font-medium text-[var(--color-ink)]">审核与可见性</p>
            <p className="mt-1">新账号的前几个帖子会进入待审核队列。被隐藏或驳回的帖子不会因为 GitHub 上仍有 Issue 而重新公开。</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
