import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import type { ProposalView } from "@/lib/queries";
import type { SessionUser } from "@/lib/participation";
import { acceptProposalAction } from "@/app/actions";
import { hasRole } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./avatar";
import { ProposalStatusBadge } from "./badges";
import { Discussion } from "./discussion";
import { Markdown } from "./markdown";
import { VoteControl } from "./vote-control";

export function ProposalCard({
  proposal,
  postId,
  user,
  userVote,
  canAccept,
  resolved,
}: {
  proposal: ProposalView;
  postId: string;
  user: SessionUser | null;
  userVote: number;
  canAccept: boolean;
  resolved: boolean;
}) {
  const accepted = proposal.status === "ACCEPTED";

  return (
    <article
      id={`proposal-${proposal.id}`}
      className={`border ${
        accepted
          ? "border-[#b9cfc0] bg-[var(--color-moss-soft)]"
          : "border-[var(--color-line)] bg-[var(--color-paper-raised)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-[1.15rem] font-semibold">{proposal.translation}</h3>
            <ProposalStatusBadge status={proposal.status} />
            {accepted && (
              <span className="inline-flex items-center gap-1 text-[0.7rem] text-[var(--color-moss)]">
                <Check className="h-3 w-3" aria-hidden />
                已进入术语库
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-[var(--color-ink-faint)]">
            <Avatar src={proposal.authorAvatarUrl} name={proposal.authorName ?? proposal.authorLogin} size={16} />
            <Link href={`/u/${proposal.authorLogin}`} className="link-quiet">
              {proposal.authorName ?? proposal.authorLogin}
            </Link>
            <span>{timeAgo(proposal.createdAt)}</span>
            {proposal.githubCommentId && (
              <span className="mono text-[0.62rem]">GitHub #{proposal.githubCommentId}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <VoteControl
            targetId={proposal.id}
            kind="proposal"
            initialScore={proposal.score}
            initialVote={userVote}
            layout="row"
          />
          {canAccept && !accepted && (
            <form action={acceptProposalAction}>
              <input type="hidden" name="proposalId" value={proposal.id} />
              <input type="hidden" name="postId" value={postId} />
              <button
                type="submit"
                className="btn btn-accent btn-sm"
                title={resolved ? "采纳后将替换当前定译" : "采纳为定译"}
              >
                采纳
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="prose-comment text-[var(--color-ink-soft)]">
          <Markdown>{proposal.rationale}</Markdown>
        </div>

        {proposal.sourceUrl && (
          <p className="mt-2 flex items-center gap-1 text-[0.72rem]">
            <ExternalLink className="h-3 w-3 text-[var(--color-ink-faint)]" aria-hidden />
            <a
              href={proposal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="link-underline break-all"
            >
              出处
            </a>
          </p>
        )}
      </div>

      <details className="border-t border-[var(--color-line)] px-4 py-2.5">
        <summary className="text-[0.75rem] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
          {proposal.commentCount > 0 ? `${proposal.commentCount} 条相关讨论` : "补充意见"}
        </summary>
        <div className="mt-3">
          <Discussion
            postId={postId}
            proposalId={proposal.id}
            comments={proposal.comments}
            isAuthenticated={!!user}
            emptyHint="对这个译法有异议？写下你的语料或替代方案。"
          />
        </div>
      </details>
    </article>
  );
}
