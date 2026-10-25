import Link from "next/link";
import { MessageSquare, GitPullRequestArrow } from "lucide-react";
import type { PostCard } from "@/lib/queries";
import { timeAgo, compactNumber } from "@/lib/format";
import { Avatar } from "./avatar";
import { DomainChip, LangPair, ResolutionBadge } from "./badges";
import { VoteControl } from "./vote-control";

export function PostRow({ post }: { post: PostCard }) {
  return (
    <article className="paper-row">
      <div className="pt-1">
        <VoteControl
          targetId={post.id}
          kind="post"
          initialScore={post.score}
          initialVote={0}
        />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link href={`/posts/${post.id}`} className="paper-title">
            {post.term}
          </Link>
          <span className="text-[0.92rem] text-[var(--color-ink-soft)]">{post.title}</span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <LangPair source={post.sourceLang} target={post.targetLang} />
          <DomainChip slug={post.domain} />
          {post.resolution === "RESOLVED" && <ResolutionBadge resolution={post.resolution} />}
          {post.acceptedTranslation && (
            <span className="chip chip-moss" title="已采纳译法">
              {post.acceptedTranslation}
            </span>
          )}
        </div>

        {post.excerpt && (
          <p className="clamp-2 mt-2 text-[0.84rem] leading-relaxed text-[var(--color-ink-soft)]">
            {post.excerpt}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] text-[var(--color-ink-faint)]">
          <span className="inline-flex items-center gap-1.5">
            <Avatar src={post.authorAvatarUrl} name={post.authorName ?? post.authorLogin} size={16} />
            <Link href={`/u/${post.authorLogin}`} className="link-quiet">
              {post.authorName ?? post.authorLogin}
            </Link>
          </span>
          <span>{timeAgo(post.publishedAt ?? post.createdAt)}</span>
          <span className="inline-flex items-center gap-1">
            <GitPullRequestArrow className="h-3 w-3" aria-hidden />
            {compactNumber(post.proposalCount)} 个译法
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" aria-hidden />
            {compactNumber(post.commentCount)} 条讨论
          </span>
          {post.githubIssueNumber && (
            <span className="mono text-[0.66rem]">#{post.githubIssueNumber}</span>
          )}
        </div>
      </div>
    </article>
  );
}
