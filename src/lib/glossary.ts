import matter from "gray-matter";
import { z } from "zod";
import { DOMAINS, LANGUAGES } from "./constants";

const languageCodes = new Set(LANGUAGES.map((language) => language.code));
const domainSlugs = new Set(DOMAINS.map((domain) => domain.slug));

export const glossaryFrontmatterSchema = z.object({
  term: z.string().trim().min(1).max(120),
  translation: z.string().trim().min(1).max(200),
  sourceLang: z.string().refine((value) => languageCodes.has(value), "未知的源语言代码"),
  targetLang: z.string().refine((value) => languageCodes.has(value), "未知的目标语言代码"),
  domain: z.string().refine((value) => domainSlugs.has(value), "未知的领域"),
  rationale: z.string().max(5000).optional(),
  postId: z.string().trim().max(64).optional(),
  acceptedBy: z.string().trim().max(80).optional(),
  acceptedAt: z.string().trim().max(40).optional(),
});

export type GlossaryFrontmatter = z.infer<typeof glossaryFrontmatterSchema>;

export function slugifyTerm(term: string): string {
  const trimmed = term.trim().toLowerCase();
  const ascii = trimmed
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || `term-${Date.now().toString(36)}`;
}

export type ParsedGlossaryFile = {
  frontmatter: GlossaryFrontmatter;
  body: string;
};

export function parseGlossaryFile(raw: string): ParsedGlossaryFile {
  const parsed = matter(raw);
  const frontmatter = glossaryFrontmatterSchema.parse(parsed.data);
  return { frontmatter, body: parsed.content.trim() };
}

export function renderGlossaryFile(input: {
  frontmatter: GlossaryFrontmatter;
  body?: string;
  discussionUrl?: string | null;
}): string {
  const { frontmatter, body } = input;
  const lines = [
    "---",
    `term: ${JSON.stringify(frontmatter.term)}`,
    `translation: ${JSON.stringify(frontmatter.translation)}`,
    `sourceLang: ${JSON.stringify(frontmatter.sourceLang)}`,
    `targetLang: ${JSON.stringify(frontmatter.targetLang)}`,
    `domain: ${JSON.stringify(frontmatter.domain)}`,
    ...(frontmatter.postId ? [`postId: ${JSON.stringify(frontmatter.postId)}`] : []),
    ...(frontmatter.acceptedBy ? [`acceptedBy: ${JSON.stringify(frontmatter.acceptedBy)}`] : []),
    `acceptedAt: ${JSON.stringify(frontmatter.acceptedAt ?? new Date().toISOString())}`,
    "---",
    "",
    `## ${frontmatter.term} → ${frontmatter.translation}`,
    "",
    frontmatter.rationale ?? body ?? "",
    ...(input.discussionUrl ? ["", `讨论：${input.discussionUrl}`] : []),
    "",
  ];
  return lines.join("\n");
}

export function glossaryRepoPath(frontmatter: GlossaryFrontmatter): string {
  return `glossary/${frontmatter.sourceLang}-${frontmatter.targetLang}/${slugifyTerm(
    frontmatter.term,
  )}.md`;
}
