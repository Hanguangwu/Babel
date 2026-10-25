import type { SortKey } from "./constants";

/**
 * Deterministic, integer hot score.
 *
 *   net      = upvotes - downvotes
 *   ageHours = (now - lastActivityAt) / 3600
 *   hotScore = round(1000 * (net + 1) / (ageHours + 2) ^ 1.5)
 *
 * Stored as an integer column so the list query can sort on an index and
 * paginate with a keyset cursor. Recompute on vote/comment/accept and once a
 * day from `/api/cron/hot-score` so old posts keep decaying.
 */
export function computeHotScore(input: {
  upvotes: number;
  downvotes: number;
  lastActivityAt: Date;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const ageHours = Math.max(
    0,
    (now.getTime() - input.lastActivityAt.getTime()) / 3_600_000,
  );
  const net = input.upvotes - input.downvotes;
  const raw = (1000 * (net + 1)) / Math.pow(ageHours + 2, 1.5);
  return Math.round(raw);
}

/** Sort key -> the integer/date value embedded in a pagination cursor. */
export type SortCursorValue = number | string;

export function encodeCursor(value: SortCursorValue, id: string): string {
  return Buffer.from(JSON.stringify({ v: value, id }), "utf8").toString("base64url");
}

export function decodeCursor(
  cursor: string | undefined | null,
): { v: SortCursorValue; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.id !== "string") return null;
    if (typeof parsed.v !== "number" && typeof parsed.v !== "string") return null;
    return { v: parsed.v, id: parsed.id };
  } catch {
    return null;
  }
}

export const SORT_ORDERS: Record<
  SortKey,
  Array<Record<string, "asc" | "desc">>
> = {
  hot: [{ hotScore: "desc" }, { id: "desc" }],
  new: [{ createdAt: "desc" }, { id: "desc" }],
  top: [{ score: "desc" }, { id: "desc" }],
  unanswered: [{ createdAt: "desc" }, { id: "desc" }],
};
