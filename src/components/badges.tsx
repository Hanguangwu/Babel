import Link from "next/link";
import {
  POST_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  RESOLUTION_LABELS,
  ROLE_LABELS,
  domainName,
  languageName,
  isRole,
  type PostStatus,
  type ProposalStatus,
  type Resolution,
} from "@/lib/constants";

export function DomainChip({ slug }: { slug: string }) {
  return (
    <Link href={`/domains/${slug}`} className="chip">
      {domainName(slug)}
    </Link>
  );
}

export function LangPair({ source, target }: { source: string; target: string }) {
  return (
    <span className="chip chip-mono" title={`${languageName(source)} → ${languageName(target)}`}>
      {languageName(source)} → {languageName(target)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label = POST_STATUS_LABELS[status as PostStatus] ?? status;
  const tone =
    status === "PUBLISHED"
      ? "chip chip-moss"
      : status === "PENDING_REVIEW"
        ? "chip"
        : "chip chip-accent";
  return <span className={tone}>{label}</span>;
}

export function ResolutionBadge({ resolution }: { resolution: string }) {
  const label = RESOLUTION_LABELS[resolution as Resolution] ?? resolution;
  if (resolution === "RESOLVED") {
    return (
      <span className="chip chip-moss">
        <span aria-hidden>✓</span>
        {label}
      </span>
    );
  }
  return <span className="chip">{label}</span>;
}

export function ProposalStatusBadge({ status }: { status: string }) {
  const label = PROPOSAL_STATUS_LABELS[status as ProposalStatus] ?? status;
  const tone = status === "ACCEPTED" ? "chip chip-moss" : status === "PROPOSED" ? "chip" : "chip chip-accent";
  return <span className={tone}>{label}</span>;
}

export function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  const label = isRole(role) ? ROLE_LABELS[role] : role;
  return <span className="chip chip-mono">{label}</span>;
}
