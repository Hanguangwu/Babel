import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/github";
import { prisma } from "@/lib/db";
import { syncIssueDiscussion } from "@/lib/sync";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type WebhookPayload = {
  action?: string;
  issue?: { number: number; pull_request?: unknown };
  comment?: { id: number };
  repository?: { id?: number; full_name?: string };
  ref?: string;
  after?: string;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId) {
    return NextResponse.json({ ok: false, error: "missing_delivery" }, { status: 400 });
  }

  let payload: WebhookPayload = {};
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventName = request.headers.get("x-github-event") ?? "unknown";
  const repoId = payload.repository?.full_name ?? null;
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  // Idempotency first: a repeated delivery must never be counted twice.
  try {
    await prisma.syncEvent.create({
      data: {
        deliveryId,
        eventName,
        repoId,
        payloadHash,
        status: "PENDING",
      },
    });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 202 });
  }

  let status: "PROCESSED" | "FAILED" = "PROCESSED";
  let error: string | null = null;

  // Only single-item issue events are handled inline; everything else is left
  // for the cron reconciliation so the webhook stays fast.
  try {
    if (
      (eventName === "issues" || eventName === "issue_comment") &&
      payload.issue &&
      !payload.issue.pull_request
    ) {
      await syncIssueDiscussion(payload.issue.number);
    } else if (eventName === "push") {
      // Glossary files are reconciled by cron; record the head for observability.
      await prisma.syncCursor.upsert({
        where: { key: "repo:head" },
        create: { key: "repo:head", value: payload.after ?? "" },
        update: { value: payload.after ?? "" },
      });
    }
  } catch (caught) {
    status = "FAILED";
    error = (caught instanceof Error ? caught.message : "unknown").slice(0, 1000);
  }

  await prisma.syncEvent.update({
    where: { deliveryId },
    data: { status, error, processedAt: new Date() },
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
