import fs from "node:fs/promises";
import path from "node:path";
import type { RepoSpec, RepoMeta, RepoMetaFile } from "./types.js";
import {
  getRepo,
  getLatestCommitSha,
  getRepoTree,
  getFileContent,
  RateLimitError,
  RepoNotFoundError,
} from "./client.js";
import { detectStack, identifyKeyFiles } from "./detect.js";

/**
 * Fetch metadata for one or more public GitHub repos and write repo.meta.json.
 * Non-blocking, best-effort: catches errors per repo and writes partial results.
 * Returns null if all repos fail.
 */
export async function enrichRepos(
  repos: RepoSpec[],
  outDir: string,
): Promise<RepoMetaFile | null> {
  const results: RepoMeta[] = [];

  for (const spec of repos) {
    try {
      const meta = await enrichSingleRepo(spec);
      results.push(meta);
    } catch (err) {
      if (err instanceof RateLimitError) {
        console.warn(
          `[github] Rate limit hit while enriching ${spec.owner}/${spec.repo}. ` +
            `Resets at ${err.resetAt.toISOString()}. Stopping further repos.`,
        );
        break;
      }
      if (err instanceof RepoNotFoundError) {
        console.warn(`[github] Repo not found: ${spec.owner}/${spec.repo}. Skipping.`);
        continue;
      }
      console.warn(
        `[github] Error enriching ${spec.owner}/${spec.repo}:`,
        (err as Error).message,
      );
      continue;
    }
  }

  if (results.length === 0) return null;

  const metaFile: RepoMetaFile = {
    repos: results,
    fetchedAt: new Date().toISOString(),
  };

  // Ensure outDir exists (runner may not have created it yet)
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, "repo.meta.json"),
    JSON.stringify(metaFile, null, 2),
    "utf-8",
  );

  return metaFile;
}

async function enrichSingleRepo(spec: RepoSpec): Promise<RepoMeta> {
  // 1. Get repo info
  const repoInfo = await getRepo(spec);

  // 2. Get latest commit on default branch
  const commit = await getLatestCommitSha(spec, repoInfo.default_branch);

  // 3. Get full tree
  const treeResponse = await getRepoTree(spec, commit.sha);

  // 4. Try to fetch root package.json
  const hasPackageJson = treeResponse.tree.some(
    (e) => e.type === "blob" && e.path === "package.json",
  );
  let packageJsonContent: string | null = null;
  if (hasPackageJson) {
    packageJsonContent = await getFileContent(spec, "package.json", repoInfo.default_branch);
    if (packageJsonContent === "") packageJsonContent = null;
  }

  // 5. Detect stack
  const stack = detectStack(treeResponse.tree, packageJsonContent);

  // 6. Identify key files
  const keyFiles = identifyKeyFiles(treeResponse.tree);

  return {
    owner: spec.owner,
    repo: spec.repo,
    role: spec.role,
    url: spec.url,
    description: repoInfo.description,
    defaultBranch: repoInfo.default_branch,
    latestSha: commit.sha,
    latestCommitDate: commit.commit.committer?.date ?? new Date().toISOString(),
    latestCommitMessage: commit.commit.message.split("\n")[0].slice(0, 120),
    language: repoInfo.language,
    topics: repoInfo.topics ?? [],
    stack,
    keyFiles,
    fetchedAt: new Date().toISOString(),
  };
}
