/**
 * Validate every glossary entry before it reaches the sync worker.
 *
 *   pnpm validate
 *
 * Rules mirror `schemas/glossary-entry.schema.json` and the runtime parser in
 * `src/lib/glossary.ts`. The script exits non-zero on the first invalid file so
 * CI and `pnpm check` fail loudly.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseGlossaryFile, slugifyTerm } from "../src/lib/glossary";

const ROOT = path.resolve(process.cwd(), "content/glossary");
const MAX_BYTES = 64 * 1024;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

async function main() {
  const files = await walk(ROOT);
  if (files.length === 0) {
    console.warn(`没有找到术语库条目：${path.relative(process.cwd(), ROOT)}`);
    return;
  }

  const seen = new Map<string, string>();
  const errors: string[] = [];

  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    const info = await stat(file);
    if (info.size > MAX_BYTES) {
      errors.push(`${relative}: 文件超过 64 KB`);
      continue;
    }

    const slugFromFile = path.basename(file, ".md");
    if (!SLUG_PATTERN.test(slugFromFile)) {
      errors.push(`${relative}: 文件名必须是 kebab-case（小写字母、数字、连字符）`);
    }

    const raw = await readFile(file, "utf8");
    let parsed;
    try {
      parsed = parseGlossaryFile(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${relative}: frontmatter 不合法 — ${message}`);
      continue;
    }

    const { frontmatter } = parsed;
    const expectedSlug = slugifyTerm(frontmatter.term);
    if (/^[a-z0-9-]+$/.test(expectedSlug) && expectedSlug !== slugFromFile) {
      errors.push(`${relative}: 文件名应与术语 slug 一致（应为 ${expectedSlug}.md）`);
    } else if (!/^[a-z0-9-]+$/.test(expectedSlug)) {
      console.warn(`${relative}: 术语不是拉丁文字，文件名沿用 kebab-case slug（${slugFromFile}）`);
    }
    if (!parsed.body && !frontmatter.rationale) {
      console.warn(`${relative}: 没有理由或正文，条目会显得单薄`);
    }

    const key = `${frontmatter.sourceLang}:${frontmatter.targetLang}:${slugFromFile}`;
    if (seen.has(key)) errors.push(`${relative}: 与 ${seen.get(key)} 重复（${key}）`);
    else seen.set(key, relative);
  }

  if (errors.length > 0) {
    console.error(`术语库校验失败（${errors.length} 处）：`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`术语库校验通过：${files.length} 个条目`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
