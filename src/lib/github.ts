import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { Octokit } from "@octokit/rest";

/**
 * GitHub integration adapter for Babel 译词论坛.
 *
 * 1. OAuth user sign-in (identity only; the access token is never stored)
 * 2. Issue/comment reads for the sync worker
 * 3. Outbound writes: issue creation, comment mirroring, glossary PRs
 *
 * Every network call is bounded by a timeout. Callers check
 * `contentRepoConfigured()` before using the write paths.
 */

const API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 15_000;

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function appConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.GITHUB_INSTALLATION_ID,
  );
}

export function contentRepoConfigured(): boolean {
  return Boolean(process.env.GITHUB_CONTENT_REPO && (appConfigured() || process.env.GITHUB_TOKEN));
}

export function parseRepo(): { owner: string; repo: string } | null {
  const value = process.env.GITHUB_CONTENT_REPO;
  if (!value || !value.includes("/")) return null;
  const [owner, repo] = value.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** GitHub App installation tokens live for one hour; cache with a safety margin. */
async function installationToken(): Promise<string> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (cachedToken && cachedToken.expiresAt - Date.now() > 5 * 60 * 1000) {
    return cachedToken.token;
  }
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !installationId || !privateKey) {
    throw new Error("GitHub App 未配置：缺少 GITHUB_APP_ID / PRIVATE_KEY / INSTALLATION_ID");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(privateKey).toString("base64url");

  const response = await fetchWithTimeout(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${header}.${payload}.${signature}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`获取 installation token 失败: ${response.status}`);
  }
  const result = (await response.json()) as { token: string; expires_at: string };
  cachedToken = {
    token: result.token,
    expiresAt: new Date(result.expires_at).getTime(),
  };
  return result.token;
}

export async function octokit(): Promise<Octokit> {
  return new Octokit({
    auth: await installationToken(),
    userAgent: "babel-terms/0.1",
    request: {
      headers: { "X-GitHub-Api-Version": API_VERSION },
      timeout: REQUEST_TIMEOUT_MS,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* OAuth                                                                      */
/* -------------------------------------------------------------------------- */

export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: "read:user user:email",
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<string> {
  const response = await fetchWithTimeout("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!payload.access_token) {
    throw new Error(payload.error_description || payload.error || "GitHub 未返回 access_token");
  }
  return payload.access_token;
}

export async function fetchGitHubProfile(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
  };
  const [userRes, emailRes] = await Promise.all([
    fetchWithTimeout("https://api.github.com/user", { headers }),
    fetchWithTimeout("https://api.github.com/user/emails", { headers }),
  ]);
  if (!userRes.ok) throw new Error(`读取 GitHub 用户失败: ${userRes.status}`);
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
    bio: string | null;
    email: string | null;
  };
  let primaryEmail: string | null = user.email;
  if (emailRes.ok) {
    const emails = (await emailRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    primaryEmail = emails.find((e) => e.primary && e.verified)?.email ?? primaryEmail;
  }
  return { ...user, email: primaryEmail };
}

/* -------------------------------------------------------------------------- */
/* Webhooks                                                                   */
/* -------------------------------------------------------------------------- */

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* Issues                                                                     */
/* -------------------------------------------------------------------------- */

export type IssueSnapshot = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  htmlUrl: string;
  updatedAt: string;
};

export type IssueCommentSnapshot = {
  id: number;
  body: string;
  authorLogin: string;
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
};

function labelNames(labels: Array<string | { name?: string }> | undefined): string[] {
  if (!labels) return [];
  return labels
    .map((label) => (typeof label === "string" ? label : label.name ?? ""))
    .filter(Boolean);
}

export async function createIssue(input: {
  title: string;
  body: string;
  labels?: string[];
}): Promise<{ number: number; url: string }> {
  const repo = parseRepo();
  if (!repo || !contentRepoConfigured()) {
    throw new Error("内容仓库未配置，无法创建 Issue");
  }
  const client = await octokit();
  const { data } = await client.rest.issues.create({
    owner: repo.owner,
    repo: repo.repo,
    title: input.title.slice(0, 240),
    body: input.body,
    labels: input.labels,
  });
  return { number: data.number, url: data.html_url };
}

export async function updateIssue(
  issueNumber: number,
  input: { title?: string; body?: string; labels?: string[]; state?: "open" | "closed" },
): Promise<void> {
  const repo = parseRepo();
  if (!repo || !contentRepoConfigured()) throw new Error("内容仓库未配置，无法更新 Issue");
  const client = await octokit();
  await client.rest.issues.update({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: issueNumber,
    ...input,
  });
}

export async function fetchIssue(issueNumber: number): Promise<IssueSnapshot | null> {
  const repo = parseRepo();
  if (!repo) throw new Error("GITHUB_CONTENT_REPO 未配置");
  const client = await octokit();
  try {
    const { data } = await client.rest.issues.get({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
    });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? "",
      state: data.state === "closed" ? "closed" : "open",
      labels: labelNames(data.labels as Array<string | { name?: string }>),
      htmlUrl: data.html_url,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

export async function fetchIssueComments(
  issueNumber: number,
  since?: string,
): Promise<IssueCommentSnapshot[]> {
  const repo = parseRepo();
  if (!repo) throw new Error("GITHUB_CONTENT_REPO 未配置");
  const client = await octokit();
  const comments = await client.paginate(client.rest.issues.listComments, {
    owner: repo.owner,
    repo: repo.repo,
    issue_number: issueNumber,
    per_page: 100,
    ...(since ? { since } : {}),
  });
  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body ?? "",
    authorLogin: comment.user?.login ?? "ghost",
    authorId: String(comment.user?.id ?? ""),
    authorName: null,
    authorAvatarUrl: comment.user?.avatar_url ?? null,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    url: comment.html_url,
  }));
}

export async function createIssueComment(
  issueNumber: number,
  body: string,
): Promise<{ id: number; url: string }> {
  const repo = parseRepo();
  if (!repo || !contentRepoConfigured()) {
    throw new Error("内容仓库未配置，无法写入 Issue 评论");
  }
  const client = await octokit();
  const { data } = await client.rest.issues.createComment({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: issueNumber,
    body,
  });
  return { id: data.id, url: data.html_url };
}

/* -------------------------------------------------------------------------- */
/* Glossary pull requests                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Create a branch with one glossary file and open a pull request against the
 * content branch. The default branch is never written to directly.
 */
export async function createGlossaryPullRequest(input: {
  path: string;
  content: string;
  message: string;
  title?: string;
  body?: string;
}): Promise<{ number: number; url: string }> {
  const repo = parseRepo();
  if (!repo || !contentRepoConfigured()) {
    throw new Error("内容仓库未配置，无法创建术语库 PR");
  }
  const client = await octokit();
  const base = process.env.GITHUB_CONTENT_BRANCH || "main";
  const branch = `glossary/${input.path.split("/").pop()?.replace(/\.md$/, "") ?? "entry"}-${Date.now()
    .toString(36)}`;

  const { data: baseRef } = await client.rest.git.getRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `heads/${base}`,
  });

  await client.rest.git.createRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `refs/heads/${branch}`,
    sha: baseRef.object.sha,
  });

  await client.rest.repos.createOrUpdateFileContents({
    owner: repo.owner,
    repo: repo.repo,
    path: input.path,
    message: input.message,
    content: Buffer.from(input.content, "utf8").toString("base64"),
    branch,
  });

  const { data: pr } = await client.rest.pulls.create({
    owner: repo.owner,
    repo: repo.repo,
    title: input.title ?? input.message,
    head: branch,
    base,
    body: input.body ?? "由 Babel 译词论坛采纳译法后自动创建。",
  });

  return { number: pr.number, url: pr.html_url };
}

/* -------------------------------------------------------------------------- */
/* Repository reads for the sync worker                                       */
/* -------------------------------------------------------------------------- */

export type TreeEntry = { path: string; sha: string; type: string };

export async function fetchRepoTree(
  branch = process.env.GITHUB_CONTENT_BRANCH || "main",
): Promise<TreeEntry[]> {
  const repo = parseRepo();
  if (!repo) throw new Error("GITHUB_CONTENT_REPO 未配置");
  const client = await octokit();
  const { data } = await client.rest.git.getTree({
    owner: repo.owner,
    repo: repo.repo,
    tree_sha: branch,
    recursive: "true",
  });
  return data.tree
    .filter((node) => node.type === "blob" && typeof node.path === "string")
    .map((node) => ({ path: node.path as string, sha: node.sha ?? "", type: node.type ?? "blob" }));
}

export async function fetchFile(
  path: string,
  branch = process.env.GITHUB_CONTENT_BRANCH || "main",
): Promise<{ content: string; sha: string } | null> {
  const repo = parseRepo();
  if (!repo) throw new Error("GITHUB_CONTENT_REPO 未配置");
  const client = await octokit();
  try {
    const { data } = await client.rest.repos.getContent({
      owner: repo.owner,
      repo: repo.repo,
      path,
      ref: branch,
    });
    if (Array.isArray(data) || data.type !== "file") return null;
    return {
      content: Buffer.from(data.content, "base64").toString("utf8"),
      sha: data.sha,
    };
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

export async function listPostIssues(input: { page?: number; perPage?: number } = {}) {
  const repo = parseRepo();
  if (!repo) throw new Error("GITHUB_CONTENT_REPO 未配置");
  const client = await octokit();
  const { DISCUSSION_LABEL } = await import("./constants");
  const { data } = await client.rest.issues.listForRepo({
    owner: repo.owner,
    repo: repo.repo,
    labels: DISCUSSION_LABEL,
    state: "all",
    per_page: input.perPage ?? 50,
    page: input.page ?? 1,
    sort: "updated",
    direction: "desc",
  });

  return data
    .filter((issue) => !issue.pull_request)
    .map<IssueSnapshot>((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      state: issue.state === "closed" ? "closed" : "open",
      labels: labelNames(issue.labels as Array<string | { name?: string }>),
      htmlUrl: issue.html_url,
      updatedAt: issue.updated_at,
    }));
}
