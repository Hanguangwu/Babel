"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { voteAction, voteProposalAction } from "@/app/actions";

type VoteControlProps = {
  targetId: string;
  kind: "post" | "proposal";
  initialScore: number;
  initialVote: number;
  layout?: "row" | "column";
};

export function VoteControl({
  targetId,
  kind,
  initialScore,
  initialVote,
  layout = "column",
}: VoteControlProps) {
  const [score, setScore] = useState(initialScore);
  const [vote, setVote] = useState(initialVote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(value: 1 | -1) {
    setError(null);
    startTransition(async () => {
      const result =
        kind === "post"
          ? await voteAction(targetId, value)
          : await voteProposalAction(targetId, value);
      if (!result.ok) {
        setError(result.error ?? "操作失败");
        return;
      }
      if (typeof result.score === "number") setScore(result.score);
      if (typeof result.userVote === "number") setVote(result.userVote);
    });
  }

  return (
    <div className={layout === "row" ? "flex items-center gap-1" : "flex flex-col items-center gap-0.5"}>
      <button
        type="button"
        className="vote-btn"
        data-active={vote === 1}
        aria-pressed={vote === 1}
        aria-label="赞同"
        disabled={pending}
        onClick={() => submit(1)}
      >
        <ChevronUp className="h-4 w-4" aria-hidden />
      </button>
      <span
        className={`mono text-[0.82rem] font-medium tabular ${score > 0 ? "text-[var(--color-moss)]" : score < 0 ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]"}`}
        aria-live="polite"
      >
        {score > 0 ? `+${score}` : score}
      </span>
      <button
        type="button"
        className="vote-btn"
        data-down="true"
        data-active={vote === -1}
        aria-pressed={vote === -1}
        aria-label="反对"
        disabled={pending}
        onClick={() => submit(-1)}
      >
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {error && <span className="max-w-[9rem] text-[0.62rem] leading-tight text-[var(--color-accent)]">{error}</span>}
    </div>
  );
}
