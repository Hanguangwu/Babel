"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getCurrentUser,
  destroySession,
  signInAsDemo,
  demoLoginEnabled,
  type DemoRole,
  recordAudit,
} from "@/lib/auth";
import { hasRole } from "@/lib/constants";
import {
  acceptProposal,
  castPostVote,
  castProposalVote,
  createComment,
  createPost,
  createProposal,
  moderatePost,
  reportContent,
  resolveReport,
} from "@/lib/participation";
import { reconcile } from "@/lib/sync";

function revalidatePost(postId: string) {
  revalidatePath("/");
  revalidatePath("/rankings");
  revalidatePath("/admin");
  revalidatePath(`/posts/${postId}`);
}

export type VoteResult = {
  ok: boolean;
  error?: string;
  score?: number;
  upvotes?: number;
  downvotes?: number;
  userVote?: number;
};

/* -------------------------------------------------------------------------- */
/* Account                                                                    */
/* -------------------------------------------------------------------------- */

export async function loginDemoAction(formData: FormData) {
  // Check the flag before touching the database so "disabled" and "database
  // unavailable" are reported as different errors instead of one catch-all.
  if (!demoLoginEnabled()) redirect("/login?error=demo_disabled");

  const kind = (formData.get("kind")?.toString() ?? "reader") as DemoRole;
  const next = formData.get("next")?.toString() || "/";
  try {
    await signInAsDemo(kind);
  } catch (error) {
    console.error("[demo-login] failed", error);
    redirect("/login?error=demo_login_failed");
  }
  redirect(safeNext(next));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/* -------------------------------------------------------------------------- */
/* Votes                                                                      */
/* -------------------------------------------------------------------------- */

export async function voteAction(postId: string, value: 1 | -1): Promise<VoteResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先使用 GitHub 登录" };

  const result = await castPostVote({ userId: user.id, postId, value });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePost(postId);
  return { ok: true, ...result.data };
}

export async function voteProposalAction(
  proposalId: string,
  value: 1 | -1,
): Promise<VoteResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先使用 GitHub 登录" };

  const result = await castProposalVote({ userId: user.id, proposalId, value });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/rankings");
  return { ok: true, ...result.data };
}

/* -------------------------------------------------------------------------- */
/* Posts                                                                      */
/* -------------------------------------------------------------------------- */

export async function createPostAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");

  const result = await createPost({
    user,
    term: formData.get("term")?.toString() ?? "",
    title: formData.get("title")?.toString() ?? "",
    sourceLang: formData.get("sourceLang")?.toString() ?? "",
    targetLang: formData.get("targetLang")?.toString() ?? "",
    domain: formData.get("domain")?.toString() ?? "",
    context: formData.get("context")?.toString() ?? "",
    body: formData.get("body")?.toString() ?? "",
  });

  if (!result.ok) redirect(`/submit?error=${encodeURIComponent(result.error)}`);

  revalidatePost(result.data.postId);
  redirect(`/posts/${result.data.postId}`);
}

/* -------------------------------------------------------------------------- */
/* Proposals                                                                  */
/* -------------------------------------------------------------------------- */

export async function createProposalAction(formData: FormData) {
  const user = await getCurrentUser();
  const postId = formData.get("postId")?.toString() ?? "";
  if (!user) redirect(`/login?next=${encodeURIComponent(`/posts/${postId}`)}`);

  const result = await createProposal({
    user,
    postId,
    translation: formData.get("translation")?.toString() ?? "",
    rationale: formData.get("rationale")?.toString() ?? "",
    sourceUrl: formData.get("sourceUrl")?.toString() ?? "",
  });

  if (!result.ok) {
    redirect(`/posts/${postId}?error=${encodeURIComponent(result.error)}#proposals`);
  }

  revalidatePost(postId);
  redirect(`/posts/${postId}?proposed=1#proposals`);
}

export async function acceptProposalAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasRole(user.role, "MODERATOR")) {
    redirect(`/posts/${formData.get("postId") ?? ""}?error=${encodeURIComponent("没有采纳权限")}`);
  }

  const result = await acceptProposal({
    user,
    proposalId: formData.get("proposalId")?.toString() ?? "",
  });

  const postId = formData.get("postId")?.toString() ?? "";
  if (!result.ok) {
    redirect(`/posts/${postId}?error=${encodeURIComponent(result.error)}#proposals`);
  }

  revalidatePost(result.data.postId);
  redirect(`/posts/${result.data.postId}?accepted=1#proposals`);
}

/* -------------------------------------------------------------------------- */
/* Comments                                                                   */
/* -------------------------------------------------------------------------- */

export async function commentAction(formData: FormData) {
  const user = await getCurrentUser();
  const postId = formData.get("postId")?.toString() ?? "";
  if (!user) redirect(`/login?next=${encodeURIComponent(`/posts/${postId}`)}`);

  const result = await createComment({
    user,
    postId,
    proposalId: formData.get("proposalId")?.toString() || null,
    parentId: formData.get("parentId")?.toString() || null,
    body: formData.get("body")?.toString() ?? "",
  });

  if (!result.ok) {
    redirect(`/posts/${postId}?error=${encodeURIComponent(result.error)}#discussion`);
  }

  revalidatePost(postId);
  redirect(`/posts/${postId}#discussion`);
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

export async function reportAction(formData: FormData) {
  const user = await getCurrentUser();
  const postId = formData.get("postId")?.toString() || null;
  const commentId = formData.get("commentId")?.toString() || null;
  const back = postId ? `/posts/${postId}` : "/";

  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);

  const result = await reportContent({
    user,
    postId,
    commentId,
    reason: formData.get("reason")?.toString() ?? "其他",
    detail: formData.get("detail")?.toString() ?? null,
  });

  if (!result.ok) redirect(`${back}?error=${encodeURIComponent(result.error)}`);

  revalidatePath("/admin");
  redirect(`${back}?reported=1`);
}

/* -------------------------------------------------------------------------- */
/* Moderation                                                                 */
/* -------------------------------------------------------------------------- */

export async function moderatePostAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  const action = formData.get("action")?.toString() ?? "";
  if (!["approve", "hide", "reject", "restore"].includes(action)) {
    redirect("/admin?error=invalid_action");
  }

  const result = await moderatePost({
    user,
    postId: formData.get("postId")?.toString() ?? "",
    action: action as "approve" | "hide" | "reject" | "restore",
  });

  if (!result.ok) redirect(`/admin?error=${encodeURIComponent(result.error)}`);

  await recordAudit({
    actorId: user.id,
    actorLogin: user.login,
    action: `post.${action}`,
    targetType: "post",
    targetId: formData.get("postId")?.toString() ?? null,
  });

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

export async function resolveReportAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  const resolution = formData.get("resolution")?.toString() === "DISMISSED" ? "DISMISSED" : "RESOLVED";
  const result = await resolveReport({
    user,
    reportId: formData.get("reportId")?.toString() ?? "",
    resolution,
    note: formData.get("note")?.toString() ?? null,
  });

  if (!result.ok) redirect(`/admin?error=${encodeURIComponent(result.error)}`);

  revalidatePath("/admin");
  redirect("/admin");
}

/* -------------------------------------------------------------------------- */
/* Sync                                                                       */
/* -------------------------------------------------------------------------- */

export async function syncNowAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!hasRole(user.role, "MODERATOR")) {
    redirect(`/admin?error=${encodeURIComponent("没有同步权限")}`);
  }

  try {
    const report = await reconcile();
    revalidatePath("/");
    revalidatePath("/admin");
    redirect(
      `/admin?synced=1&posts=${report.posts}&comments=${report.comments}&glossary=${report.glossary}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    redirect(`/admin?error=${encodeURIComponent(message)}`);
  }
}
