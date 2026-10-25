import Link from "next/link";
import { Flag } from "lucide-react";
import type { CommentNode } from "@/lib/queries";
import { commentAction, reportAction } from "@/app/actions";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./avatar";
import { Markdown } from "./markdown";

type DiscussionProps = {
  postId: string;
  comments: CommentNode[];
  isAuthenticated: boolean;
  proposalId?: string;
  emptyHint?: string;
};

function CommentItem({
  comment,
  postId,
  proposalId,
  isAuthenticated,
}: {
  comment: CommentNode;
  postId: string;
  proposalId?: string;
  isAuthenticated: boolean;
}) {
  return (
    <li className="border-t border-[var(--color-line)] py-3.5 first:border-t-0 first:pt-0">
      <div className="flex gap-2.5">
        <Avatar src={comment.authorAvatarUrl} name={comment.authorName ?? comment.authorLogin} size={24} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[0.74rem] text-[var(--color-ink-faint)]">
            <Link href={`/u/${comment.authorLogin}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-accent)]">
              {comment.authorName ?? comment.authorLogin}
            </Link>
            {comment.isPostAuthor && <span className="chip chip-mono">发起人</span>}
            {comment.githubCommentId && (
              <span className="mono text-[0.62rem]">GitHub #{comment.githubCommentId}</span>
            )}
            <span>{timeAgo(comment.createdAt)}</span>
          </div>

          <div className="mt-1.5 text-[var(--color-ink-soft)]">
            <Markdown>{comment.body}</Markdown>
          </div>

          {isAuthenticated && (
            <div className="mt-1.5 flex items-center gap-4">
              <details>
                <summary className="text-[0.72rem] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
                  回复
                </summary>
                <form action={commentAction} className="mt-2 space-y-2">
                  <input type="hidden" name="postId" value={postId} />
                  {proposalId && <input type="hidden" name="proposalId" value={proposalId} />}
                  <input type="hidden" name="parentId" value={comment.id} />
                  <textarea
                    name="body"
                    required
                    rows={3}
                    maxLength={5000}
                    placeholder={`回复 @${comment.authorLogin}`}
                    className="field text-[0.82rem]"
                  />
                  <button type="submit" className="btn btn-outline btn-sm">
                    发送回复
                  </button>
                </form>
              </details>

              <details>
                <summary className="inline-flex items-center gap-1 text-[0.72rem] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]">
                  <Flag className="h-3 w-3" aria-hidden />
                  举报
                </summary>
                <form action={reportAction} className="mt-2 space-y-2">
                  <input type="hidden" name="postId" value={postId} />
                  <input type="hidden" name="commentId" value={comment.id} />
                  <input
                    name="reason"
                    required
                    maxLength={80}
                    placeholder="举报理由，例如人身攻击"
                    className="field text-[0.82rem]"
                  />
                  <button type="submit" className="btn btn-outline btn-sm">
                    提交举报
                  </button>
                </form>
              </details>
            </div>
          )}
        </div>
      </div>

      {comment.replies.length > 0 && (
        <ul className="mt-3 space-y-3 border-l border-[var(--color-line)] pl-4">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              proposalId={proposalId}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Discussion({
  postId,
  comments,
  isAuthenticated,
  proposalId,
  emptyHint = "还没有人发言。第一条评论不必完美，说清楚你的依据即可。",
}: DiscussionProps) {
  return (
    <div>
      {comments.length === 0 ? (
        <p className="border border-dashed border-[var(--color-line-strong)] px-4 py-6 text-center text-[0.82rem] text-[var(--color-ink-faint)]">
          {emptyHint}
        </p>
      ) : (
        <ul>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              postId={postId}
              proposalId={proposalId}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </ul>
      )}

      {isAuthenticated ? (
        <form action={commentAction} className="mt-5 border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4">
          <input type="hidden" name="postId" value={postId} />
          {proposalId && <input type="hidden" name="proposalId" value={proposalId} />}
          <label className="label" htmlFor={`comment-${proposalId ?? "post"}`}>
            {proposalId ? "补充对这个译法的意见" : "参与讨论"}
          </label>
          <textarea
            id={`comment-${proposalId ?? "post"}`}
            name="body"
            required
            rows={4}
            maxLength={5000}
            placeholder="支持或反对的理由、语料、出处，都比一句“我觉得”更有用。"
            className="field mt-1.5 text-[0.86rem]"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[0.68rem] text-[var(--color-ink-faint)]">
              评论会同步到 GitHub Issue，并保留双方记录。
            </span>
            <button type="submit" className="btn btn-primary btn-sm">
              发表评论
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-5 border border-dashed border-[var(--color-line-strong)] px-4 py-4 text-center text-[0.8rem] text-[var(--color-ink)]">
          <Link href={`/login?next=${encodeURIComponent(`/posts/${postId}`)}`} className="link-underline">
            使用 GitHub 登录
          </Link>{" "}
          后可以参与讨论。
        </p>
      )}
    </div>
  );
}
