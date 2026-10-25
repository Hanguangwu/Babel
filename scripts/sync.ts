/**
 * Content sync entry point.
 *
 *   pnpm sync            # 把 content/glossary 下的条目写入数据库
 *   pnpm sync --github   # 从 GitHub 拉取 Issue / 评论 / 术语库
 *
 * The script reuses the same server-side modules as the web app. They do not
 * import `server-only`, so running under tsx is safe.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { upsertGlossaryEntry } from "../src/lib/ingest";
import { syncFromGitHub } from "../src/lib/sync";

const ROOT = path.resolve(process.cwd(), "content/glossary");

try {
  process.loadEnvFile?.(".env");
} catch {
  // .env is optional; Vercel injects environment variables directly.
}

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

async function syncLocalGlossary() {
  const files = await walk(ROOT);
  if (files.length === 0) {
    console.warn("content/glossary 为空，没有可导入的条目");
    return;
  }

  let imported = 0;
  for (const file of files) {
    // Repo-relative path (`content/glossary/...`) so local and GitHub syncs
    // share one key with `glossaryPathFor()`.
    const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
    const content = await readFile(file, "utf8");
    try {
      await upsertGlossaryEntry({ path: relative, content, commitSha: null });
      imported += 1;
      console.log(`✓ ${relative}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ ${relative}: ${message}`);
    }
  }
  console.log(`本地术语库导入完成：${imported}/${files.length}`);
}

async function main() {
  const fromGitHub = process.argv.includes("--github");
  if (fromGitHub) {
    const report = await syncFromGitHub({ actorLogin: "cli" });
    console.log(
      `GitHub 同步完成：帖子 ${report.posts}，评论 ${report.comments}，术语库 ${report.glossary}，跳过 ${report.skipped}`,
    );
    for (const error of report.errors) console.error(`  ! ${error}`);
    return;
  }

  await syncLocalGlossary();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
