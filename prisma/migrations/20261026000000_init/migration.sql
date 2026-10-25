-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "email" TEXT,
    "bio" TEXT,
    "affiliation" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "usedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Post" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "contextMarkdown" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "resolution" TEXT NOT NULL DEFAULT 'OPEN',
    "authorId" TEXT NOT NULL,
    "authorLogin" TEXT NOT NULL,
    "githubIssueNumber" INTEGER,
    "githubIssueUrl" TEXT,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "hotScore" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "proposalCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PostRevision" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SITE',
    "authorId" TEXT,
    "authorLogin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Proposal" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorLogin" TEXT NOT NULL,
    "authorName" TEXT,
    "authorAvatarUrl" TEXT,
    "translation" TEXT NOT NULL,
    "rationaleMarkdown" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "githubCommentId" TEXT,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "proposalId" TEXT,
    "parentId" TEXT,
    "githubCommentId" TEXT,
    "authorGithubId" TEXT,
    "authorLogin" TEXT NOT NULL,
    "authorName" TEXT,
    "authorAvatarUrl" TEXT,
    "bodySnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "localAuthorId" TEXT,
    "isPostAuthor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PostVote" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProposalVote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GlossaryEntry" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "rationaleMarkdown" TEXT NOT NULL DEFAULT '',
    "postId" TEXT,
    "path" TEXT NOT NULL,
    "commitSha" TEXT,
    "acceptedByLogin" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlossaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reporterId" TEXT,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SyncEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "repoId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GitHubWriteJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "proposalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubWriteJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SyncCursor" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."Asset" (
    "id" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT,
    "size" INTEGER,
    "mime" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLogin" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "detailJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubUserId_key" ON "public"."User"("githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "public"."User"("login");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "public"."Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "public"."Invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Post_githubIssueNumber_key" ON "public"."Post"("githubIssueNumber");

-- CreateIndex
CREATE INDEX "Post_status_hotScore_idx" ON "public"."Post"("status", "hotScore");

-- CreateIndex
CREATE INDEX "Post_status_lastActivityAt_idx" ON "public"."Post"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Post_status_publishedAt_idx" ON "public"."Post"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Post_domain_status_idx" ON "public"."Post"("domain", "status");

-- CreateIndex
CREATE INDEX "Post_sourceLang_targetLang_status_idx" ON "public"."Post"("sourceLang", "targetLang", "status");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "public"."Post"("authorId");

-- CreateIndex
CREATE INDEX "PostRevision_postId_createdAt_idx" ON "public"."PostRevision"("postId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_githubCommentId_key" ON "public"."Proposal"("githubCommentId");

-- CreateIndex
CREATE INDEX "Proposal_postId_score_idx" ON "public"."Proposal"("postId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_postId_translation_key" ON "public"."Proposal"("postId", "translation");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_githubCommentId_key" ON "public"."Comment"("githubCommentId");

-- CreateIndex
CREATE INDEX "Comment_postId_createdAt_idx" ON "public"."Comment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_proposalId_createdAt_idx" ON "public"."Comment"("proposalId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "public"."Comment"("parentId");

-- CreateIndex
CREATE INDEX "PostVote_postId_value_idx" ON "public"."PostVote"("postId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "PostVote_postId_userId_key" ON "public"."PostVote"("postId", "userId");

-- CreateIndex
CREATE INDEX "ProposalVote_proposalId_value_idx" ON "public"."ProposalVote"("proposalId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalVote_proposalId_userId_key" ON "public"."ProposalVote"("proposalId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryEntry_postId_key" ON "public"."GlossaryEntry"("postId");

-- CreateIndex
CREATE INDEX "GlossaryEntry_term_idx" ON "public"."GlossaryEntry"("term");

-- CreateIndex
CREATE INDEX "GlossaryEntry_domain_idx" ON "public"."GlossaryEntry"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryEntry_sourceLang_targetLang_slug_key" ON "public"."GlossaryEntry"("sourceLang", "targetLang", "slug");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "public"."Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncEvent_deliveryId_key" ON "public"."SyncEvent"("deliveryId");

-- CreateIndex
CREATE INDEX "SyncEvent_status_receivedAt_idx" ON "public"."SyncEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubWriteJob_idempotencyKey_key" ON "public"."GitHubWriteJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GitHubWriteJob_status_runAfter_idx" ON "public"."GitHubWriteJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "GitHubWriteJob_postId_idx" ON "public"."GitHubWriteJob"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_pathname_key" ON "public"."Asset"("pathname");

-- CreateIndex
CREATE INDEX "Asset_uploadedById_idx" ON "public"."Asset"("uploadedById");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "public"."AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "public"."Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invite" ADD CONSTRAINT "Invite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PostRevision" ADD CONSTRAINT "PostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PostRevision" ADD CONSTRAINT "PostRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Proposal" ADD CONSTRAINT "Proposal_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Proposal" ADD CONSTRAINT "Proposal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "public"."Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_localAuthorId_fkey" FOREIGN KEY ("localAuthorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PostVote" ADD CONSTRAINT "PostVote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PostVote" ADD CONSTRAINT "PostVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProposalVote" ADD CONSTRAINT "ProposalVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "public"."Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProposalVote" ADD CONSTRAINT "ProposalVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? Update available 6.16.2 -> 8.0.0-rc.27                 鈹?鈹?                                                        鈹?鈹? This is a major update - please follow the guide at    鈹?鈹? https://pris.ly/d/major-version-upgrade                鈹?鈹?                                                        鈹?鈹? Run the following to update                            鈹?鈹?   npm i --save-dev prisma@latest                       鈹?鈹?   npm i @prisma/client@latest                          鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
