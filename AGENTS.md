# AGENTS.md

本文件是给在本仓库工作的 AI/人类协作者的**操作约束与上下文入口**。开始改代码前先读完本文，再读对应设计文档。

## 1. 项目是什么

Babel 译词论坛是一个**讨论翻译词汇（术语）问题**的论坛站点：

- 帖子（Post）= 一个术语问题：术语原文 + 源语言 + 目标语言 + 领域 + 语境；
- 译法建议（Proposal）= 帖子内的结构化候选译法（译文 / 理由 / 出处），可单独投票；
- 讨论 = GitHub Issue / Issue Comment；
- 采纳的译法沉淀为内容仓库里的术语库 Markdown 条目；
- 站点自己维护用户、角色、投票、举报、审核、采纳、同步与审计；
- 页面读取只读数据库/缓存，**不在请求时实时调用 GitHub**。

事实来源划分（最重要的一条设计前提）：

| 数据 | 事实来源 |
|---|---|
| 帖子正文、译法建议正文、站内评论 | 本地 Postgres（Issue 是单向或双向镜像） |
| GitHub 上的 Issue / 评论 | GitHub（按隐藏 marker 幂等导入） |
| Issue 标签 | GitHub，但不得覆盖本地审核态 |
| 投票、审核状态、采纳决定、举报、角色、审计 | 本地 Postgres |

产品与架构细节见：

- `README.md`（产品模型、运行与部署入口）
- `docs/基于 GitHub 与 Vercel 的论坛风格 ArXiv 网站技术设计.md`
  —— **论文时代的设计文档**：基础设施章节（Vercel/Neon/Queues/缓存/安全）仍然有效，产品与数据模型章节已被本文件与 `README.md` 取代；引用前先确认是否仍适用。
- `docs/content-authoring.md` —— 仍是论文语料规范，**待重写为术语库条目规范**，不要照它新增内容字段。

`docs/论坛风格 ArXiv 网站技术设计.md` 是已废弃的早期草案，不要按它实现。

## 2. 当前状态（重要）

仓库已完成从论文站点到译词论坛的迁移：论文时代的 `Paper`、`content/papers`、`/papers/**` 代码与迁移文件已删除。

| 能力 | 当前实现 | 备注 |
|---|---|---|
| 领域模型 | `Post` / `PostRevision` / `Proposal` / `PostVote` / `ProposalVote` / `Comment` / `GlossaryEntry` / `GitHubWriteJob` / `SyncCursor` | 见 `prisma/schema.prisma` |
| 路由 | `/posts/[id]`、`/api/v1/posts/**`、`/domains`、`/glossary`、`/u/[login]` | `next.config.ts` 为 `/papers/*`、`/categories/*`、`/authors/*` 保留 301 |
| 内容形态 | 帖子正文存 Postgres；术语库镜像为 `content/glossary/<src>-<tgt>/<slug>.md` | Issue 是帖子的单向镜像 |
| 数据库 | Neon Postgres，迁移文件 `20261026000000_init` | 已应用论文时代迁移的开发分支需 `pnpm db:reset` |
| 文件写入 | 请求路径只写 DB；GitHub 写入进 `GitHubWriteJob` | 消费由 Cron / 手动触发 |
| Webhook | 验签 + `SyncEvent.deliveryId` 去重 + 202 + 单 issue 增量同步 | 不做全量扫描 |
| 后台任务 | `GitHubWriteJob` 表 + `/api/cron/reconcile` | Vercel Queues / Workflows 尚未接入 |
| 缓存 | 公开页面仍动态渲染 | `use cache` / tag 失效待做 |
| 搜索 | Prisma `contains` + `mode: "insensitive"` | `pg_trgm` 待做 |

**因此：**

- 继续按目标命名写代码（`Post` 不是 `Paper`，`postId` 不是 `paperId`）；
- 发帖、评论、投票、采纳一律先写本地，再入队镜像到 GitHub；请求路径不等待 GitHub；
- 尚未完成的部分见 §14，每步单独可验证，不要合并成大 PR；
- 不要重新引入 `content/papers`、SQLite 或请求内文件写入。

### 命名映射（迁移前 → 当前，已完成）

| 迁移前 | 当前 | 备注 |
|---|---|---|
| `Paper` | `Post` | 加 `term`、`sourceLang`、`targetLang`、`domain`、`contextMarkdown`、`resolution`、`hotScore` |
| `PaperVersion` | `PostRevision` | 帖子正文快照，`SITE` / `GITHUB` 来源 |
| `Vote(paperId, userId)` | `PostVote` + `ProposalVote` | 拆表，避免多态外键 |
| `Comment.paperId` | `Comment.postId` | 增加可选 `proposalId` |
| `Paper.githubIssueNumber` | `Post.githubIssueNumber` | 帖子 = Issue |
| `content/papers/<year>/<paperId>-<slug>/` | `content/glossary/<src>-<tgt>/<slug>.md` | 帖子不再有文件形态 |
| `paperId` | `postId` | 不可变，URL 使用它 |
| `src/lib/queries.ts` 中的论文读模型 | 帖子/术语库读模型 | 保持单文件，按函数拆分 |

## 3. 目标架构（Vercel 全托管）

| 层 | 技术 |
|---|---|
| Web / API | Next.js 16 App Router，Node.js runtime，Vercel Functions（Fluid compute） |
| 关系库 | Neon Postgres，通过 Vercel Marketplace 接入；`DATABASE_URL` 池化，`DATABASE_URL_UNPOOLED` 迁移 |
| 缓存/限流 | Upstash Redis（Marketplace，`@upstash/redis` REST） |
| 页面/数据缓存 | Next.js `use cache` + `cacheLife` + `cacheTag`；`use cache: remote`；ISR/CDN |
| 异步 | Vercel Queues（Beta，`@vercel/queue`） |
| 长任务 | Vercel Workflows（`workflow` SDK，`"use workflow"` / `"use step"`） |
| 定时 | Vercel Cron（UTC；Hobby 每天一次，Pro 每分钟） |
| 文件 | Vercel Blob（`@vercel/blob`；>4.5 MB 必须 client upload） |
| 搜索 | Postgres `pg_trgm`；规模上升再接 Upstash Search 等 Marketplace 服务 |
| 防护 | Vercel Firewall / WAF Rate Limiting |
| 身份/内容源 | GitHub OAuth/App + Issue（外部依赖，不变） |

**纠正：** Vercel 当前没有第一方 Postgres/Redis 引擎；“Vercel Postgres/KV” 已是历史产品，现由 Neon/Upstash 通过 Marketplace 提供。不要把 Neon/Upstash 写成 Vercel 自研数据库。

## 4. 硬性约束（MUST / MUST NOT）

### MUST

- 所有持久状态放 Postgres / Redis / Blob / GitHub；函数实例无状态。
- Webhook 先验签、用 `SyncEvent.deliveryId` 唯一约束去重，再入队，尽快返回 202。
- 所有异步写操作幂等：唯一约束 + `idempotencyKey` + upsert。
- 发帖/评论/投票先写本地，再入队镜像到 GitHub；**请求路径不等待 GitHub**。
- 投票以本地 `PostVote` / `ProposalVote` 为唯一事实来源；一个用户对一个目标只有一行。
- 热度分在服务端用整数计算并落列（`hotScore`），排序走索引；分页必须 cursor + 稳定 tiebreaker（`hotScore, id`）。
- 计数（`upvotes` / `downvotes` / `commentCount` / `proposalCount`）与事实表在同一事务内更新。
- 外部调用设置超时；批量 GitHub 调用限制并发（≤ 5）。
- 大文件走 Vercel Blob client upload；服务端只签发 token、记录元数据。
- 公开页面优先缓存；写操作后按 tag/path 主动失效。
- 生产迁移用 `prisma migrate deploy`，Preview 用 Neon Preview Branch。
- 发帖、评论、译法建议、上传做服务端权限与输入校验；管理操作（审核、采纳、下架）写 `AuditLog`。
- 修改 schema 时同时提供迁移文件与回滚/兼容说明。

### MUST NOT

- 不在请求路径使用 `node:fs` 写文件（`writeFile` / `mkdir` / `appendFile`）。
- 不新增 SQLite 专属功能；不把 `prisma/dev.db` 作为运行时数据源。
- 不在 Vercel Function 里跑 `setInterval` / 长循环 / 常驻队列消费者。
- 不在 Webhook 中同步全量扫描 GitHub。
- 不在请求内实时调用 GitHub 读 Issue/Comment（页面只读本地索引）。
- 不在生产使用 `prisma db push` 或 `prisma migrate reset`。
- 不把“采纳译法”实现成同步写文件或同步建 PR；必须走 `GitHubWriteJob`。
- 不用 GitHub reactions 冒充赞/踩，也不把投票回写成两套真相；镜像默认关闭。
- 不把 GitHub token、App 私钥、Webhook secret、`AUTH_SECRET` 写入日志或客户端。
- 不把大附件塞进函数请求体（4.5 MB 限制）。
- 不把帖子正文/评论树/术语库全文塞进 Runtime Cache（单条 2 MB）。
- 不用客户端隐藏按钮代替服务端授权（投票、采纳、审核、删除）。
- 不提交 `.env`、`.env.local`、`prisma/dev.db`、`.next`。
- 不在一个 PR 里同时做“重命名 + 队列 + 缓存 + 新功能”。

## 5. 目录地图

```text
content/glossary/<src>-<tgt>/<slug>.md    # 术语库镜像（已采纳译法）
prisma/schema.prisma                      # Post / Proposal / Vote / Glossary 等模型
prisma/migrations/                        # 迁移文件入库（20261026000000_init）
scripts/validate-content.ts               # 术语库条目校验
scripts/sync.ts                           # 本地术语库入库 / GitHub 拉取（--github）
schemas/glossary-entry.schema.json         # 术语库 frontmatter JSON Schema
src/lib/glossary.ts                       # frontmatter zod schema、slug、渲染
src/lib/ranking.ts                        # hotScore、cursor 编解码、排序
src/lib/ingest.ts                         # 幂等入库、marker、GitHubWriteJob 消费
src/lib/sync.ts                           # GitHub 拉取同步（Issue / 评论 / 术语库）
src/lib/queries.ts                        # 读模型：列表、详情、搜索、热度、后台
src/lib/participation.ts                  # 投票、评论、译法建议、采纳
src/lib/github.ts                         # OAuth、App JWT、Issue/PR 写入
src/lib/auth.ts                           # Session、邀请、角色、演示登录（默认关闭）
src/app/actions.ts                        # Server Actions（写操作）
src/app/api/v1/**                         # 公开读 API + 写 API
src/app/api/webhooks/github/route.ts      # 验签 + SyncEvent + 单 issue 增量同步
src/app/api/cron/**                        # Cron：reconcile、hot-score
src/app/api/queues/**                     # 待建：Vercel Queues 消费者
src/workflows/**                          # 待建：Vercel Workflows（历史回填）
```

## 6. 命令

### 当前可用

```bash
pnpm install
pnpm dev
pnpm build           # 含 prisma generate + prisma migrate deploy
pnpm start
pnpm typecheck
pnpm validate        # 校验 content/glossary 术语库条目
pnpm check           # typecheck + validate
pnpm db:generate     # 生成 Prisma Client
pnpm db:migrate      # 开发分支迁移（prisma migrate dev）
pnpm db:deploy       # 应用已提交迁移（Preview/Production）
pnpm db:reset        # 仅 Neon Development 分支，会清空数据（不导入种子）
pnpm sync            # 本地术语库条目入库（仅 dev）
pnpm sync --github   # 从 GitHub 拉取（Issue / 评论 / 术语库）
```

> pnpm 11 不再读取 `package.json` 的 `pnpm` 字段，且默认 `strictDepBuilds`。依赖的安装脚本
> （Prisma 的四个包、esbuild）已在 `pnpm-workspace.yaml` 的 `allowBuilds` 允许；新增带
> postinstall 的依赖必须同步这一项，否则 CI 的 `pnpm install --frozen-lockfile` 会以
> `ERR_PNPM_IGNORED_BUILDS` 失败。

### 部署相关

```bash
vercel link
vercel env pull .env          # Prisma CLI 读取 .env
vercel dev                    # 可选，本地模拟 Vercel 环境
pnpm test                     # 补充后
```

> 不要在 Production 手动执行 `db:reset`。生产数据由内容同步与用户行为产生。

## 7. 环境变量

必需/常用：

```dotenv
DATABASE_URL=                 # Neon 池化连接
DATABASE_URL_UNPOOLED=        # Neon 直连，迁移用
AUTH_SECRET=                  # 32+ 字节，按环境独立
ALLOW_DEMO_LOGIN=false        # 生产必须为 false；仅本地 UI 调试可设为 true
ALLOW_OPEN_SIGNUP=false       # 生产必须为 false；临时开放注册后改回
GITHUB_CLIENT_ID=             # OAuth App：登录
GITHUB_CLIENT_SECRET=
GITHUB_APP_ID=                # GitHub App：Issue / 评论 / PR / Webhook
GITHUB_APP_PRIVATE_KEY=
GITHUB_INSTALLATION_ID=
GITHUB_WEBHOOK_SECRET=
GITHUB_CONTENT_REPO=          # 内容仓库 owner/repo（Issue + glossary）
GITHUB_CONTENT_BRANCH=main
GITHUB_REDIRECT_URI=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BLOB_READ_WRITE_TOKEN=        # 或 BLOB_STORE_ID + VERCEL_OIDC_TOKEN
SYNC_TOKEN=                   # 可选
CRON_SECRET=                  # 可选
```

规则：

- `AUTH_SECRET`、Webhook secret、App 私钥**每个环境独立**。
- Preview 不得使用 Production 的数据库/Blob/Secret。
- 新增环境变量必须同步 `.env.example` 与本文件。

## 8. 编码约定

- TypeScript strict；优先 Server Component，交互才用 `"use client"`。
- 服务端模块加 `import "server-only"`（数据库、鉴权、GitHub、Blob）。
- 所有外部输入用 zod 校验；错误返回结构化 `{ ok, error }`，不要抛未处理异常给页面。
- Prisma 访问统一走 `src/lib/db.ts` 单例；不要在组件里 `new PrismaClient()`。
- 事务只包数据库操作；不要在事务内调用 GitHub/Blob/队列。
- 时间统一 UTC；展示层再本地化。
- 计数/排序字段不要用浮点；投票用整数与唯一约束；`hotScore` 用整数（见 §9）。
- 新增路由显式声明 `runtime = "nodejs"`（涉及 Prisma/Node API 时），避免误用 Edge。
- 不要引入新的重型依赖（ORM、搜索、队列）而不先更新设计文档。

## 9. 数据与内容规则

- `postId` 不可变；URL 用 `postId`，不用标题；标题变化只改字段。
- 帖子字段：`term`（术语原文）、`sourceLang`、`targetLang`（BCP-47）、`domain`（取自 `src/lib/constants.ts` 白名单）、`contextMarkdown`、`status`、`resolution`。
- **`status` 与 `resolution` 分离**：`status` 是审核态（`PENDING_REVIEW / PUBLISHED / HIDDEN / REJECTED`），`resolution` 是讨论结论（`OPEN / RESOLVED`）。
- 审核状态由站点拥有：同步不得把管理员 `HIDDEN`/`REJECTED` 的帖子重新公开；GitHub 侧标签不得覆盖本地审核态。
- `Proposal` 唯一约束 `(postId, translation)`；采纳一个即把其余置 `SUPERSEDED`，并写 `AuditLog`。
- 采纳权限：`MODERATOR` 或该 `domain` 的 maintainer；不接受“帖子作者自动采纳”。
- 术语库条目 `(sourceLang, targetLang, slug)` 唯一；同一术语的历史变更走新 PR，不覆盖。
- 评论保存 `bodySnapshot` 与 GitHub 来源；删除用软删除，保留回复链与审计。
- 投票以本地表为事实来源；不要假装 GitHub reactions 提供“踩”。
- GitHub 映射使用隐藏 marker：`<!-- babel:post:<id> -->`、`<!-- babel:proposal:<id> -->`、`<!-- babel:comment:<id> -->`；解析时要求 marker 合法且唯一，缺失则按普通评论导入。
- 新增内容字段必须同时更新：zod schema、JSON Schema、`README.md` 的映射表、示例数据（如适用）。

### 热度分（实现约束）

```text
net      = upvotes - downvotes
ageHours = (now - lastActivityAt) / 3600
hotScore = round( 1000 * (net + 1) / power(ageHours + 2, 1.5) )   -- 结果转整数落库
```

- 投票/评论/采纳的同一事务内重算；
- `/api/cron/hot-score` 每日全量重算（衰减）；
- 排序 `ORDER BY hotScore DESC, id DESC`，索引 `(status, hotScore, id)`；
- 禁止 `OFFSET` 分页、禁止把全量结果拉到 Node 里排序。

## 10. 异步任务规则

- 事件入口只做：验签 → `SyncEvent` 去重 → 入队 → 202。
- 消费者按 `deliveryId` / `jobId` 幂等；重复投递不得重复计数。
- 创建 Issue 用 `idempotencyKey = postId`，先查 `Post.githubIssueNumber` 再建，避免重复 Issue。
- 镜像评论/建议用 `githubCommentId` 回填；失败写 `GitHubWriteJob.lastError` / `attempts` / `nextAttemptAt`。
- 单次消费者处理小批量（建议 ≤ 10 条），剩余重新入队或交给 Workflow。
- 全量回填/历史重建用 Workflow；不要用 Cron 直接跑全量。
- 超过阈值转 `DEAD` 并在 `/admin` 可见。
- 新增 topic/消费者要更新 `vercel.json` 与 README 的部署说明。
- 保留降级路径：队列不可用时，Cron 扫描 `SyncEvent(PENDING/FAILED)` 与 `GitHubWriteJob(PENDING)` 触发 Workflow。

## 11. 缓存规则

- 公开数据用 `use cache` + `cacheLife` + `cacheTag`；tag 命名：
  - `post:<id>`
  - `post:<id>:discussion`
  - `posts:list`
  - `posts:hot`
  - `posts:domain:<slug>`
  - `posts:lang:<src>-<tgt>`
  - `glossary:<src>-<tgt>`
- 写操作后调用 `revalidateTag` / `revalidatePath`；投票只失效该帖与相关榜单；批量操作合并 tag，注意平台速率限制。
- 用户态（Session、我的投票、管理员标记）不得进入公共缓存；`cookies()` 在 `use cache` 外读取。
- `use cache: remote` 只放小对象；不要把全文/评论树放进去。
- 热度榜用短 TTL（30–60s）+ 写后主动失效，避免高频投票击穿缓存。

## 12. 安全

- Session：HMAC HttpOnly Cookie；生产 `secure`；不存 GitHub access token。
- Webhook：`X-Hub-Signature-256` 验签 + `X-GitHub-Delivery` 幂等；生产缺 secret 必须拒绝。
- OAuth：`state` + PKCE；回调地址与 GitHub 配置完全一致。
- Markdown：`rehype-sanitize` 白名单；禁止原始 HTML、`javascript:`、内联事件。
- 上传：校验 Session/角色、MIME、magic bytes、大小；待审核文件不公开。
- 频率：WAF + Redis 滑动窗口 + 数据库计数兜底；发帖、评论、投票、举报都要限流。
- 审计：发帖、编辑、采纳、审核、下架、恢复、举报、同步失败、权限变更都要记录。
- 日志脱敏：不打印 token、Cookie、私钥、完整正文。
- 用户生成内容默认不可信：Issue 标签、Issue body、评论内容都要经过 marker/schema 校验再入库。

## 13. 验证

提交前至少运行：

```bash
pnpm typecheck
pnpm validate
```

涉及数据库/同步/队列的改动，额外验证：

- `pnpm exec prisma migrate diff` 或迁移在空库可重放；
- 在 Neon Development 分支运行 `pnpm db:deploy`，确认空库可重放；不要依赖已移除的 seed 脚本；
- Webhook 重复投递 10 次不产生重复帖子/评论；
- 同一用户重复投票只保留一行，计数不重复累加；
- 队列消息重投不重复创建 Issue / PR；
- 热度排序分页无重复、无遗漏（cursor + `id` tiebreaker）；
- 合并 PR 后 60 秒内缓存失效；
- Preview 使用独立 Neon 分支；
- `rg "node:fs|writeFile|mkdir\(|dev\.db|sqlite" src/` 无请求路径命中；
- 采纳译法后术语库 PR 可重复执行而不产生重复提交。

## 14. 迁移优先级（当前待办）

已完成：

1. ✅ Prisma → Neon Postgres，初始迁移入库。
2. ✅ 领域模型迁移：`Post` / `PostRevision` / `Proposal` / `PostVote` / `ProposalVote` / `Comment` / `GlossaryEntry` / `GitHubWriteJob` / `SyncCursor`；旧 `Paper` 已删除。
3. ✅ 路由与 API 改名：`/posts/[id]`、`/api/v1/posts/**`；旧路径 301。
4. ✅ 发帖改为 DB 先行 + `GitHubWriteJob` 创建 Issue；请求路径无文件写入。
5. ✅ Webhook 验签 + `SyncEvent` 去重 + 202 + 单 issue 增量同步。
6. ✅ 评论/译法建议镜像与术语库 PR 走 `GitHubWriteJob`（Cron / 手动触发消费）。
7. ✅ 热度分重算与 `/api/cron/hot-score`、`/api/cron/reconcile`。
8. ✅ 术语库条目规范、`pnpm validate`、示例条目、`.env.example`、`vercel.json` Cron。

待办：

9. 接入 Vercel Queues 消费者，替换 Cron 兜底。
10. 开启 `cacheComponents`，公开读模型加缓存与 tag 失效（见 §11）。
11. 搜索加 Postgres `pg_trgm` 索引；当前 `contains` 已显式使用 `mode: "insensitive"`。
12. 接入 Vercel Blob（截图/扫描件 client upload）。
13. 配置 `vercel.json` 函数时长；加 WAF 限流。
14. 重写 `docs/content-authoring.md` 为术语库条目规范；补集成测试。
15. 全量历史回填 / 对账改用 Workflow；不要用 Cron 跑全量。

每一步单独可验证，不要合并。

## 15. Agent 工作方式

- 先读本文件与 `README.md`，再动代码；引用设计文档前确认该章节是否仍适用于译词论坛。
- 改动前用 `rg` 确认调用点；不要凭印象改 schema 或 API。
- 一次只做一个可验证的迁移步骤；不要把“重命名 + 队列 + 缓存”塞进一个 PR。
- 重命名类改动使用 `rg` 全量核对并保留别名，避免破坏已有 URL 与外部引用。
- 不执行破坏性命令（`migrate reset`、删库、删 Blob、强推）除非用户明确要求。
- 不修改生产环境变量；需要时给出 `vercel env` 命令让用户执行。
- 完成后说明：改了什么、如何验证、还有什么未完成。
