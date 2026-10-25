# Babel · 译词论坛

一个讨论**翻译词汇（术语）问题**的论坛站点：译者提出一个术语在某语言对、某领域、某语境下该怎么译，
社区给出译法建议、投票、讨论，管理员/领域维护者采纳后沉淀进**术语库**。

内容与审计仍然落在 GitHub 上：**一个帖子 = 一个 GitHub Issue**，**一条回复 = 一条 Issue Comment**，
**采纳的译法 = 一个术语库 Markdown 文件 + PR**。网站自己维护用户、角色、投票、举报、审核、同步与审计，
页面读取只读数据库/缓存，**不在请求时实时调用 GitHub**。

- 身份：仅 GitHub OAuth 登录（不做邮箱注册），角色由站内管理。
- 业务数据：Neon Postgres（用户、帖子、译法建议、投票、举报、审核、审计、同步事件）。
- 缓存/限流：Upstash Redis；页面缓存：Next.js `use cache` / ISR / CDN。
- 异步：Vercel Queues + Workflows；定时：Vercel Cron。
- 部署目标：**完全运行在 Vercel 上**。

> 设计依据（架构仍然有效，产品部分以本文件与 [AGENTS.md](AGENTS.md) 为准）：
> [基于 GitHub 与 Vercel 的论坛风格 ArXiv 网站技术设计](docs/基于%20GitHub%20与%20Vercel%20的论坛风格%20ArXiv%20网站技术设计.md)
>
> 协作者约束：[AGENTS.md](AGENTS.md)

---

## 产品模型

| 概念 | 说明 |
|---|---|
| **Post（帖子）** | 一条术语讨论。必填：术语原文、源语言、目标语言、领域、语境说明；可选：现有译法、出处链接、附件。`postId` 不可变，URL 使用它 |
| **Proposal（译法建议）** | 帖子内结构化的候选译法：译文 + 理由 + 出处。可单独投票，可被采纳 |
| **Comment（讨论）** | 对帖子或某条译法建议的回复，支持一层以上的回复链（`parentId`） |
| **Vote（投票）** | 对帖子或译法建议的赞/踩（`+1 / -1`），**本地数据库是唯一事实来源** |
| **Glossary（术语库）** | 被采纳的译法，落到内容仓库的 Markdown 文件，可被检索、引用、导出 |
| **Report（举报）** | 对帖子/评论/译法建议的举报，进入后台队列 |

一条典型流程：

```text
发帖（术语 + 语境） → 社区给译法建议 → 投票 + 讨论 → 维护者采纳
   → 生成术语库条目 PR → 合并后同步入库 → 帖子标记 RESOLVED
```

### 排序

| 排序 | 含义 | 实现 |
|---|---|---|
| `new` | 最新发布/最近活动 | `publishedAt` / `lastActivityAt` + `id` |
| `hot` | 热度（默认） | 预计算整数 `hotScore`，见下 |
| `top` | 净票数（时间窗：7d / 30d / all） | `upvotes - downvotes` |
| `unanswered` | 还没有被采纳译法的帖子 | `resolution = OPEN` + 活动时间 |

热度公式（确定、可在 SQL 中排序、不使用浮点列）：

```text
net      = upvotes - downvotes
ageHours = (now - lastActivityAt) / 3600
hotScore = round( 1000 * (net + 1) / power(ageHours + 2, 1.5) )   -- 结果转整数落库
```

- 投票、评论、采纳时在**同一事务内**重算并写回 `Post.hotScore`；
- 每日 Cron 重算全量热度（时间衰减），避免只依赖写入时机；
- 索引 `(status, hotScore DESC, id DESC)`；分页一律 `cursor`，并带 `id` 作为稳定 tiebreaker，禁止 `OFFSET` 深翻。

### 审核状态

- 新用户/低信任用户发帖 → `PENDING_REVIEW`；老用户 → 直接 `PUBLISHED`。
- `PUBLISHED / PENDING_REVIEW / HIDDEN / REJECTED`，状态归站点所有：
  **同步不得把管理员 `HIDDEN` / `REJECTED` 的帖子重新公开**。
- 采纳译法需要 `MODERATOR` 或该领域 `maintainer` 权限，并写 `AuditLog`。

---

## 运行形态

```mermaid
flowchart LR
  U[浏览器] --> V[Vercel CDN / Firewall]
  V --> N[Next.js 16 on Vercel Functions]
  N --> PG[(Neon Postgres)]
  N --> R[(Upstash Redis)]
  N --> B[Vercel Blob]
  N --> Q[Vercel Queues]
  N --> G[GitHub API]
  G -->|webhook| N
  C[Vercel Cron] --> N
```

| 能力 | 选型 | 说明 |
|---|---|---|
| 页面 / API | Next.js 16 App Router + Vercel Functions | Node.js runtime、Fluid compute；列表缓存，详情 SSR/ISR |
| 数据库 | **Neon Postgres**（Vercel Marketplace） | `DATABASE_URL` 池化，`DATABASE_URL_UNPOOLED` 迁移；Preview 用独立分支 |
| 缓存 / 限流 | **Upstash Redis**（Vercel Marketplace） | REST 客户端；缓存、限流、幂等键 |
| 页面缓存 | Next.js `use cache` / ISR / Runtime Cache | 写后 `revalidateTag` |
| 异步任务 | **Vercel Queues**（Beta） | Issue/Comment 镜像、PR 创建重试 |
| 长任务 | **Vercel Workflows** | 历史回填、跨步骤对账 |
| 定时 | **Vercel Cron** | 每日对账 + 热度重算；Hobby 每天一次，Pro 每分钟 |
| 搜索 | Postgres `pg_trgm` | 术语、译法、语境的中文子串检索 |
| 文件 | **Vercel Blob** | 截图/词典扫描件；>4.5 MB 走 client upload |
| 身份 / 内容源 | GitHub OAuth/App + Issue | 外部依赖，保持不变 |

> Vercel 没有第一方 Postgres/Redis 引擎；Neon、Upstash 通过 Marketplace 提供，Vercel 负责开通、注入环境变量与账单。
> 第一方能力是 Blob、Queues、Workflows、Cron、Runtime Cache、Firewall。

---

## 与 GitHub 的映射

| 站点对象 | GitHub 对象 | 约定 |
|---|---|---|
| 帖子 | Issue | 标签 `term-post`、`lang:en-zh`、`domain:legal`、`state:open\|resolved`；正文含 `<!-- babel:post:<postId> -->` |
| 译法建议 | Issue Comment | 标记 `<!-- babel:proposal:<proposalId> -->`，正文按模板写“译文 / 理由 / 出处” |
| 讨论回复 | Issue Comment | 标记 `<!-- babel:comment:<commentId> -->`，保留回复链 |
| 采纳 | Issue label + 术语库 PR | 打 `translation:accepted` 标签，创建 `glossary/<src>-<tgt>/<slug>.md` 的 PR |
| 术语库条目 | Markdown 文件 | 文件 = 不可变 slug；内容变更走新 PR，历史由 git 保存 |

**事实来源的划分（实现以此为准）：**

- **帖子**：站内创建与编辑，数据库是事实来源；Issue 是单向镜像（站内 → GitHub），Issue 里的正文改动不回写；
- **评论 / 译法建议**：双向同步。站内写入用隐藏 marker 镜像为 Issue Comment；GitHub 上新增的评论按普通评论导入；
- **Issue 标签**：GitHub 拥有标签，但**本地审核态优先**。`HIDDEN` / `REJECTED` 的帖子不会因为 Issue 仍在而重新公开；
- 业务状态（投票、审核状态、采纳决定、举报、角色、审计）以本地数据库为准；
- 采纳译法后由后台任务创建术语库 PR，不在请求路径同步建 PR；
- 投票**不同步**到 GitHub reactions——GitHub 没有“踩”，部分镜像会造成两套真相；如需展示可选只镜像净赞数（默认关闭）。

---

## 快速开始（Neon Postgres）

### 1. 准备数据库连接

推荐通过 Vercel Marketplace 创建 Neon，并连接 Development / Preview / Production：

```bash
pnpm install
vercel link
vercel env pull .env          # Prisma CLI 读取 .env；Next.js 也会加载它
```

没有 Vercel 项目时，也可以在 Neon 控制台创建项目，把 Pooled 与 Direct 连接串写入 `.env`：

```dotenv
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5"
DATABASE_URL_UNPOOLED="postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
```

> `DATABASE_URL` 供运行时使用（池化）；`DATABASE_URL_UNPOOLED` 供 `prisma migrate` 使用（直连）。
> 不要把 Production 的连接串用于本地开发。

### 2. 初始化并启动

```bash
pnpm db:deploy   # 应用 prisma/migrations
pnpm dev         # http://localhost:3000
```

数据库默认为空，不包含演示帖子或演示用户。内容从 GitHub Issue 同步导入，用户通过 GitHub 登录或邀请产生。

> 演示登录默认关闭。仅本地 UI 调试时可设置 `ALLOW_DEMO_LOGIN=true`，登录页会按需创建三个演示账号；生产必须为 `false`。
>
> `db:reset` 会清空当前数据库，只能在 Neon Development 分支使用。

开启演示登录后，登录页提供三个本地账号：

| 演示身份 | 账号 | 权限 |
|---|---|---|
| 读者 | `wangzhe` | 浏览、搜索、投票、举报 |
| 译者 | `linxiaoyu` | 发帖、评论、提交译法建议（CONTRIBUTOR） |
| 管理员 | `admin` | 审核、采纳、下架、处理举报、触发同步（ADMIN） |

> 演示账号只用于本地体验，不写入真实仓库；生产与共享 Preview 禁止开启演示登录。

### 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建（含 `prisma migrate deploy`）与启动 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm validate` | 校验 `content/glossary` 下的术语库条目（frontmatter、slug、重复） |
| `pnpm check` | typecheck + validate |
| `pnpm sync` | 把本地术语库条目写入数据库（仅开发） |
| `pnpm sync --github` | 从配置的 GitHub 仓库/Issue 拉取并同步 |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:migrate` | 创建/应用开发分支迁移（`prisma migrate dev`） |
| `pnpm db:deploy` | 应用已提交的迁移（Preview/Production） |
| `pnpm db:reset` | 重建 Development 分支数据库（不导入种子） |

### 部署相关命令

| 命令 | 作用 |
|---|---|
| `vercel link` | 关联 Vercel 项目 |
| `vercel env pull .env` | 拉取 Neon/Upstash/Blob 环境变量 |
| `vercel dev` | 本地模拟 Vercel 环境（可选） |
| `pnpm test` | 单元/集成测试（待补充） |

---

## 部署到 Vercel

> 领域模型与路由已完成迁移（`Post` / `Proposal` / `PostVote` / `GlossaryEntry`，`/posts/[id]`）。
> 尚未完成：Vercel Queues 消费者（当前用 `GitHubWriteJob` 表 + Cron/手动触发兜底）、缓存层、Blob 上传、`pg_trgm` 搜索。
> 迁移文件已替换为单一 init：**已经应用过论文时代迁移的开发分支需要 `pnpm db:reset`**（无生产数据）。

### 1. 准备托管资源

1. **Neon Postgres**：Vercel Dashboard → Storage / Marketplace → Neon，与 Functions 同区域，连接 Production / Preview / Development。
2. **Upstash Redis**：Marketplace → Upstash Redis；记录 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。
3. **Vercel Blob**：Storage → Blob。公开附件用 public store；待审核附件用 private store（访问模式创建后不可改）。
4. **GitHub OAuth App**（登录）+ **GitHub App**（Issue、评论、webhook、术语库 PR）。

### 2. 配置环境变量

```dotenv
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require&pgbouncer=true
DATABASE_URL_UNPOOLED=postgresql://.../neondb?sslmode=require

AUTH_SECRET=...
ALLOW_DEMO_LOGIN=false
ALLOW_OPEN_SIGNUP=false
NEXT_PUBLIC_SITE_URL=https://your.site

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n"
GITHUB_INSTALLATION_ID=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_CONTENT_REPO=owner/translation-terms
GITHUB_CONTENT_BRANCH=main
GITHUB_REDIRECT_URI=https://your.site/api/v1/auth/github/callback

UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
BLOB_READ_WRITE_TOKEN=...
```

Neon 集成自动注入 `DATABASE_URL` / `DATABASE_URL_UNPOOLED` 及兼容用的 `POSTGRES_*`；
Upstash 注入 `UPSTASH_REDIS_REST_*`，旧 `KV_*` 仅作兼容。

### 3. 构建命令

```bash
prisma generate && prisma migrate deploy && next build
```

- 生产禁止 `prisma db push`。
- Preview 使用 Neon Preview Branch，迁移自动应用到分支库。
- 发布串行化，避免多个 Deployment 同时跑迁移。

### 4. 定时与队列

`vercel.json` 示例：

```json
{
  "regions": ["sin1"],
  "crons": [
    { "path": "/api/cron/reconcile", "schedule": "0 3 * * *" },
    { "path": "/api/cron/hot-score", "schedule": "30 3 * * *" }
  ]
}
```

函数时长写在路由文件里，而不是 `vercel.json`：

```ts
// src/app/api/webhooks/github/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// src/app/api/queues/github-write/route.ts
export const runtime = "nodejs";
export const maxDuration = 300;
```

- Hobby 的 Cron 只能每天一次，精度 ±59 分钟；生产建议 Pro。
- Queue 消费者在 `vercel.json` 中声明 trigger，是私有函数，无公开 URL。
- Webhook 地址：`https://your.site/api/webhooks/github`，Content type `application/json`。

### 5. 发布后检查

1. 首页、帖子详情、搜索、登录、发帖、投票、评论各跑一遍。
2. 手动触发 `/api/cron/reconcile`，确认 GitHub head 与 `RepositoryCursor` 一致。
3. 发一个测试帖：Issue 在 60 秒内创建，标签正确，页面显示 `syncedAt`。
4. 重放同一个 Webhook delivery 10 次，确认不产生重复帖子/评论/投票计数。
5. 采纳一条译法，确认术语库 PR 创建且合并后站内可检索。

---

## 目录结构

```text
content/glossary/<src>-<tgt>/<slug>.md   # 术语库镜像（目标）
prisma/schema.prisma                     # 用户、帖子、译法建议、评论、投票、举报、同步事件、审计
schemas/                                 # 元数据 JSON Schema
scripts/validate-content.ts              # 术语库条目校验
scripts/sync.ts                          # 本地/GitHub 同步入口
src/lib/content.ts                       # 已删除（论文解析）
src/lib/glossary.ts                      # 术语库 frontmatter 解析与渲染
src/lib/ingest.ts                        # 幂等入库
src/lib/sync.ts                          # GitHub 拉取同步
src/lib/queries.ts                       # 读模型：列表、详情、搜索、热度
src/lib/participation.ts                 # 投票、评论、译法建议（Web 与 API 共用）
src/lib/github.ts                        # OAuth、App JWT、Issue/PR 写入
src/lib/auth.ts                          # Session、邀请制、角色、Demo 登录（默认关闭）
src/app/actions.ts                       # Server Actions（写操作）
src/app/api/v1/**                        # 公开读 API + 写 API
src/app/api/webhooks/github/route.ts     # GitHub Webhook
```

异步与运维入口（已实现 / 待建）：

```text
src/app/api/cron/**     # Vercel Cron：对账（含写队列）与热度重算
src/app/api/webhooks/github  # 验签 + SyncEvent 去重 + 单 issue 增量同步
src/app/api/queues/**   # 待建：Vercel Queues 消费者（当前由 Cron 兜底）
src/app/api/blob/**     # 待建：Blob client upload token
src/workflows/**        # 待建：历史回填与全量对账
```

> 领域模型与路由已完成迁移（`Post` / `Proposal` / `PostVote` / `GlossaryEntry`、`/posts/[id]`）。
> 论文时代的 `Paper` / `content/papers` / `/papers/[id]` 已移除，只保留一版 301 重定向。

---

## 核心流程

### 发帖（数据库先行，Issue 异步创建）

1. 用户在 `/submit` 填写：术语原文、源语言、目标语言、领域、语境（例句/出处）、可选现有译法与附件。
2. 服务端 zod 校验 + 频率/权限检查后，Postgres 事务内写 `Post`（`PENDING_REVIEW` 或 `PUBLISHED`）、`PostRevision`、`AuditLog`、`GitHubWriteJob`。
3. 立即返回帖子详情页；后台消费者用 `idempotencyKey = postId` 创建 Issue（模板 + 标签 + marker），保存 `githubIssueNumber` / `githubIssueUrl`。
4. Issue 创建失败只影响镜像：本地帖子仍在，`GitHubWriteJob` 重试，后台可见。
5. 管理员批准后公开，按 tag 失效缓存；被 `HIDDEN` / `REJECTED` 的帖子不会被同步重新公开。

> 关键约束：**运行时不再写 `content/`**。Vercel 文件系统只读，用户内容进数据库，GitHub 侧异步创建。

### 讨论与译法建议

- 评论/建议先做登录、角色、频率、长度校验，再写本地表，然后入队镜像到 Issue Comment。
- 译法建议是结构化对象（`translation`、`rationale`、`sourceUrl`），**不是**纯文本评论：
  便于去重、投票、采纳与导出术语库。
- 镜像失败保留本地内容并重试；`GitHubWriteJob` / `SyncEvent` 记录失败原因。
- 展示排序由本地索引完成，不在请求里调用 GitHub。
- GitHub 上人工新增/编辑的评论通过 `issue_comment` Webhook 以 `since` 游标增量拉回，写 `bodySnapshot`。

### 投票与热度

- `PostVote` / `ProposalVote` 分别建表，唯一约束 `(targetId, userId)`，`value ∈ {+1, -1}`。
- 同一事务内：upsert 投票 → 重算 `upvotes/downvotes/score/hotScore` → 写审计（仅管理动作）。
- 重复投递/重复点击幂等：唯一约束 + `idempotencyKey`；不得重复计数。
- 用户态（我的投票）不进公共缓存。

### 采纳译法 → 术语库

1. `MODERATOR` 或该领域 `maintainer` 采纳某条 `Proposal`（写 `AuditLog`）。
2. `Proposal.status = ACCEPTED`，其余候选转 `SUPERSEDED`；`Post.resolution = RESOLVED`。
3. 入队创建术语库 PR：`glossary/<src>-<tgt>/<term-slug>.md`，含术语、译文、领域、出处、讨论链接、`postId`。
4. 合并后 `push` Webhook 触发增量同步，写 `GlossaryEntry` 与 `commitSha`；页面按 tag 失效。
5. 冲突（同一术语已存在条目）走“新 PR 修改旧条目”，不覆盖历史。

### 同步与一致性

- Webhook 先验签（`X-Hub-Signature-256`），再用 `SyncEvent.deliveryId` 唯一约束去重，然后入队并立即 202。
- 验签通过后不在请求内扫描仓库。
- `push` 走增量 compare + 分批；首次全量/历史重建用 Vercel Workflow。
- `issue_comment` / `issues` 用 `since` 游标增量拉取，避免全量覆盖。
- 每日 Cron 对账：GitHub head 与 `RepositoryCursor` 不一致、或存在 `FAILED` 事件时启动修复。
- 页面展示 `syncedAt`、Issue 链接与 commit 链接，便于复核。

---

## 数据模型要点

- **User**：`githubUserId` 唯一不可变，`login` 仅展示；角色 `USER / CONTRIBUTOR / MODERATOR / ADMIN`；译者资料含语言对、领域、机构。
- **Post**：`id` 即对外 `postId`，URL 使用它；`term`、`sourceLang`、`targetLang`、`domain`、`contextMarkdown`；`status`、`resolution`、`hotScore`、计数、`githubIssueNumber`、`syncedAt`。
- **PostRevision**：帖子正文快照（`SITE` / `GITHUB` 来源），用于审计与 diff。
- **Proposal**：`postId` + `translation` + `rationale` + `sourceUrl`；状态 `PROPOSED / ACCEPTED / REJECTED / SUPERSEDED`；`(postId, translation)` 唯一，避免重复候选。
- **Comment**：`postId`、可选 `proposalId`、`parentId`；保存 `bodySnapshot`、`githubCommentId`；删除用软删除，保留回复链与审计。
- **PostVote / ProposalVote**：唯一约束，本地是唯一事实来源。
- **GlossaryEntry**：语言对 + 术语 + 采纳译法 + `postId` + `commitSha`，与内容仓库文件一一对应。
- **SyncEvent**：Webhook outbox，`deliveryId` 唯一，记录 `status / attempts / nextAttemptAt / lastError`。
- **GitHubWriteJob**：Issue 创建、评论镜像、术语库 PR 等出站写的重试队列。
- **Asset**：Vercel Blob 的 pathname、URL、SHA-256、大小、MIME、可见性。
- **AuditLog**：发帖、编辑、采纳、审核、下架、举报、同步、权限变更。

---

## API

列表一律 cursor 分页，返回 `source`、`syncedAt` 等溯源字段。

```text
GET  /api/v1/posts?query=&lang=&domain=&sort=hot|new|top|unanswered&cursor=&limit=
GET  /api/v1/posts/:id
GET  /api/v1/posts/:id/revisions
GET  /api/v1/posts/:id/discussion?sort=oldest|top
POST /api/v1/posts                          { term, sourceLang, targetLang, domain, context, ... }
POST /api/v1/posts/:id/vote                 { value: 1 | -1 }
POST /api/v1/posts/:id/proposals            { translation, rationale, sourceUrl? }
POST /api/v1/posts/:id/comments             { body, parentId?, proposalId? }
POST /api/v1/posts/:id/report               { reason, detail?, commentId? }
POST /api/v1/proposals/:id/vote             { value: 1 | -1 }
POST /api/v1/proposals/:id/accept           (MODERATOR / 领域 maintainer)
GET  /api/v1/glossary?lang=&domain=&query=&cursor=
GET  /api/v1/auth/github/start?next=
GET  /api/v1/auth/github/callback
POST /api/v1/auth/logout
GET  /api/v1/me
POST /api/v1/sync                           (MODERATOR 或 x-sync-token)
POST /api/webhooks/github                   (GitHub App)
```

迁移后新增：

```text
POST /api/blob/upload                  # 生成 client upload token
POST /api/blob/upload-completed        # Blob 完成回调
POST /api/queues/github-write          # 队列消费者（私有）
POST /api/queues/post-sync
POST /api/queues/comment-sync
GET  /api/cron/reconcile               # Vercel Cron
GET  /api/cron/hot-score
```

> `/api/v1/papers/**` 已移除；`next.config.ts` 为 `/papers/:id`、`/categories/*`、`/authors/*` 保留一版 301 重定向。

---

## 接入真实 GitHub

拆成两个应用，不要试图只用一个 OAuth App 完成所有事情：

| 能力 | 应用 | 说明 |
|---|---|---|
| 登录 | **GitHub OAuth App** | 读取身份与已验证邮箱，不访问仓库 |
| Issue 读写、术语库 PR、Webhook | **GitHub App** | 安装到内容仓库，用安装令牌读写 Issues / Contents / Pull requests |

### 1. 准备稳定域名

下文统一用 `https://your-domain`。不要使用每次部署都变化的 Preview 地址：
回调地址、Webhook 与 `GITHUB_REDIRECT_URI` 必须使用同一个稳定域名。

### 2. 创建 GitHub OAuth App（只负责登录）

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App。

| 字段 | 填写 |
|---|---|
| Application name | `Babel 译词论坛` |
| Homepage URL | `https://your-domain` |
| Authorization callback URL | `https://your-domain/api/v1/auth/github/callback` |

- OAuth App 只有**一个** callback URL，必须与 `GITHUB_REDIRECT_URI` 完全一致（协议、域名、路径、大小写、末尾 `/`）。
- 代码只请求 `read:user user:email`，登录本身没有仓库权限。

```dotenv
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=https://your-domain/api/v1/auth/github/callback
```

### 3. 创建 GitHub App（Issue、评论、PR、Webhook）

GitHub → Settings → Developer settings → GitHub Apps → New GitHub App。

| 字段 | 填写 |
|---|---|
| GitHub App name | `Babel Term Bot`（全 GitHub 唯一） |
| Homepage URL | `https://your-domain` |
| Callback URL | 留空（登录由 OAuth App 负责） |
| Webhook URL | `https://your-domain/api/webhooks/github` |
| Webhook Secret | 随机字符串，填入 `GITHUB_WEBHOOK_SECRET` |
| SSL verification | Enable |

生成 secret：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Repository permissions：

| 权限 | 级别 | 用途 |
|---|---|---|
| Issues | Read and write | 创建帖子 Issue、镜像评论、打标签 |
| Contents | Read and write | 读取术语库、创建分支与提交 |
| Pull requests | Read and write | 创建术语库 PR |
| Metadata | Read-only | GitHub 强制要求 |

Subscribe to events：`Issues`、`Issue comment`、`Push`、`Installation`。

### 4. 安装 GitHub App

1. 记录 **App ID**（数字，不是 Client ID）。
2. **Generate a private key**，下载 `.pem`。
3. **Install App**，只勾选内容仓库（如 `Hanguangwu/translation-terms`）。
4. 安装页地址 `https://github.com/settings/installations/12345678` 末尾数字即 `GITHUB_INSTALLATION_ID`。

```dotenv
GITHUB_CONTENT_REPO=Hanguangwu/translation-terms
GITHUB_CONTENT_BRANCH=main
```

### 5. 内容仓库约定

```text
.github/ISSUE_TEMPLATE/term-post.yml      # 帖子模板（站外发帖也用同一套字段）
glossary/<src>-<tgt>/<slug>.md            # 采纳译法
glossary/<src>-<tgt>/index.md             # 语言对索引（可选，自动生成）
```

Issue 标签（需要在仓库预建，站内按需创建）：

```text
term-post              # 站点帖子
lang:en-zh / lang:ja-zh
domain:legal / domain:medical / domain:literary
state:open / state:resolved
translation:accepted
```

### 6. 本地与 Preview

- 本地开发建议**单独创建一个 OAuth App**，回调为 `http://localhost:3000/api/v1/auth/github/callback`。
- Preview 域名每次变化，最容易出现 `redirect_uri_mismatch`；Preview 默认禁用 GitHub 登录，或为 Preview 单独建 OAuth App。
- `GITHUB_REDIRECT_URI` 按环境分别设置。

### 7. 首次登录、邀请与角色

- 数据库为空时，第一个 GitHub 登录用户自动成为 `ADMIN`。
- 之后新用户需要邀请，或临时 `ALLOW_OPEN_SIGNUP=true`（用后改回 `false`）。
- 提升管理员：

```sql
UPDATE "User" SET role = 'ADMIN' WHERE login = '你的GitHub用户名';
```

### 8. 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| `redirect_uri_mismatch` | 回调地址与 `GITHUB_REDIRECT_URI` 不一致 | 检查协议、域名、路径、末尾 `/` |
| 登录页没有 GitHub 按钮 | OAuth 变量未配置或未重新部署 | 检查 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` |
| 生产仍出现演示登录 | `ALLOW_DEMO_LOGIN=true` | 设为 `false` 并重新部署 |
| `invite_required` | 已有用户，新用户没有邀请 | 临时开放注册或创建邀请 |
| Webhook `401 invalid_signature` | `GITHUB_WEBHOOK_SECRET` 不一致 | 重新填写 GitHub App 与 Vercel 的 secret |
| 创建 Issue 404 | App 未安装到仓库，或 `GITHUB_CONTENT_REPO` 不一致 | 检查安装范围与仓库名 |
| 评论 403 `Resource not accessible by integration` | Issues 权限不足 | 给 Issues Write 并重新批准安装 |
| 闭帖后又被重开 | 同步覆盖了本地状态 | 状态以本地为准，修正同步逻辑 |
| 私钥解析失败 | PEM 换行丢失 | 多行粘贴，或使用 `\n` |

### 9. 安全检查

- Client Secret、App 私钥、Webhook secret 只放服务端环境变量，不进客户端 bundle、不写日志。
- App 权限最小化；修改权限后安装方需重新批准。
- Session 不保存 GitHub access token。
- 生产保持 `ALLOW_DEMO_LOGIN=false`。
- 泄露立即轮换，并更新 Vercel 环境变量。

---

## 安全

- Markdown 不启用原始 HTML，`rehype-sanitize` 白名单过滤；链接只允许 http/https，外链带 `noopener noreferrer`。
- Session 使用 HMAC-SHA256 签名，HttpOnly + SameSite=Lax + Secure，7 天过期；不保存 GitHub access token。
- Webhook 验签 + delivery 幂等；私钥只从环境变量读取，不写日志。
- 发帖/评论长度、频率、重复内容限制；投票与举报做用户级限流（Redis 滑动窗口 + 数据库计数兜底）。
- 上传校验 MIME、magic bytes、大小；待审核附件不公开。
- 管理动作（审核、采纳、下架、权限变更）服务端鉴权并写 `AuditLog`。
- 版权/违规处理：先隐藏站内展示与搜索索引，保留 GitHub 与审计证据。

---

## 限额与运维

| 项 | 限制 | 应对 |
|---|---|---|
| Function 请求/响应体 | 4.5 MB | 附件走 Blob client upload |
| Function 时长 | 默认 300s；Pro 800s；1800s beta | 全量同步拆 Workflow/队列 |
| Cron | Hobby 每天一次；Pro 每分钟 | 生产用 Pro |
| Runtime Cache | 2 MB/条、128 tags | 只缓存列表页与计数字段 |
| Blob | 5 TB/文件；public/private 固定 | 已发布 public，待审核 private |
| WAF | Hobby 1 条规则；Pro 40 条 | 生产用 Pro |
| 队列 | 消息 100 MB、保留 7 天 | 只传 ID/cursor |

生产建议开启：

- Vercel Observability / Log Drain；
- Neon PITR 与分支备份；
- 队列积压、`SyncEvent.FAILED`、同步 lag、5xx、DB 连接数告警；
- 每日对账、每日热度重算、每周全量抽样校验。

---

## 迁移状态与待办

从“论文站点”切换到“译词论坛”：

- [x] Prisma `sqlite` → `postgresql`，初始迁移入库（阶段 1）
- [x] CI 用临时 Postgres 回放迁移（`validate-db.yml`）
- [x] 领域模型：`Post`、`PostRevision`、`Proposal`、`PostVote`、`ProposalVote`、`Comment`、`GlossaryEntry`、`GitHubWriteJob`、`SyncCursor`
- [x] 路由与 API：`/posts/[id]`、`/api/v1/posts/**`，`/papers/*` 保留 301
- [x] 发帖“DB 先行 + `GitHubWriteJob` 创建 Issue”，移除运行时文件写入
- [x] Webhook 验签 + `SyncEvent` 去重 + 202 + 单 issue 增量同步
- [x] 评论 / 译法建议镜像与术语库 PR 走 `GitHubWriteJob`（Cron 兜底）
- [x] `hotScore` 重算与 `/api/cron/hot-score`、`/api/cron/reconcile`
- [x] 术语库条目规范 + `pnpm validate` + 示例条目
- [ ] 接入 Vercel Queues，替换 Cron 兜底
- [ ] 开启 `cacheComponents`，公开读模型加缓存与失效（tag 见 AGENTS §11）
- [ ] 搜索改用 Postgres `pg_trgm`
- [ ] 接入 Vercel Blob（截图/扫描件 client upload）
- [ ] `vercel.json` 函数时长、WAF 限流
- [ ] 重写 `docs/content-authoring.md` 为术语库条目规范，补集成测试

步骤、验收标准与风险见 [AGENTS.md §14](AGENTS.md)。

---

## 许可

演示内容为虚构文本，仅用于产品演示；代码默认 MIT。
