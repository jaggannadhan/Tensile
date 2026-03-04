import type {
  RepoSpec,
  GitHubRepoResponse,
  GitHubCommitResponse,
  GitHubTreeResponse,
  RateLimitInfo,
} from "./types.js";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "Tensile-WebQA/0.1";

// Module-level rate limit state (shared across all requests in the process)
let rateLimitInfo: RateLimitInfo = {
  remaining: 60,
  limit: 60,
  resetAt: new Date(0),
};

export function getRateLimitInfo(): RateLimitInfo {
  return { ...rateLimitInfo };
}

// --- URL parsing ---

const GITHUB_URL_REGEX = /^https?:\/\/github\.com\/([^/]+)\/([^/\s#?]+)/;

export function parseRepoUrl(url: string, role: string): RepoSpec | null {
  const match = url.match(GITHUB_URL_REGEX);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");
  return { owner, repo, url, role };
}

// --- Error classes ---

export class GitHubApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class RateLimitError extends GitHubApiError {
  constructor(public resetAt: Date) {
    super(429, `GitHub API rate limit exceeded. Resets at ${resetAt.toISOString()}`);
    this.name = "RateLimitError";
  }
}

export class RepoNotFoundError extends GitHubApiError {
  constructor(public spec: RepoSpec) {
    super(404, `Repository not found: ${spec.owner}/${spec.repo}`);
    this.name = "RepoNotFoundError";
  }
}

// --- Core fetch wrapper ---

async function githubFetch<T>(path: string): Promise<T> {
  // Check budget before making request
  if (rateLimitInfo.remaining <= 0 && rateLimitInfo.resetAt > new Date()) {
    throw new RateLimitError(rateLimitInfo.resetAt);
  }

  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github.v3+json",
    },
  });

  // Update rate limit info from response headers
  const remaining = res.headers.get("x-ratelimit-remaining");
  const limit = res.headers.get("x-ratelimit-limit");
  const reset = res.headers.get("x-ratelimit-reset");

  if (remaining !== null) rateLimitInfo.remaining = Number(remaining);
  if (limit !== null) rateLimitInfo.limit = Number(limit);
  if (reset !== null) rateLimitInfo.resetAt = new Date(Number(reset) * 1000);

  if (res.status === 403 && rateLimitInfo.remaining === 0) {
    throw new RateLimitError(rateLimitInfo.resetAt);
  }

  if (res.status === 404) {
    throw new GitHubApiError(404, `Not found: ${path}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubApiError(res.status, `GitHub API error ${res.status}: ${body.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

// --- Public API functions ---

export async function getRepo(spec: RepoSpec): Promise<GitHubRepoResponse> {
  return githubFetch<GitHubRepoResponse>(`/repos/${spec.owner}/${spec.repo}`);
}

export async function getLatestCommitSha(
  spec: RepoSpec,
  branch: string,
): Promise<GitHubCommitResponse> {
  return githubFetch<GitHubCommitResponse>(
    `/repos/${spec.owner}/${spec.repo}/commits/${encodeURIComponent(branch)}`,
  );
}

export async function getRepoTree(
  spec: RepoSpec,
  sha: string,
): Promise<GitHubTreeResponse> {
  return githubFetch<GitHubTreeResponse>(
    `/repos/${spec.owner}/${spec.repo}/git/trees/${sha}?recursive=1`,
  );
}

export async function getFileContent(
  spec: RepoSpec,
  filePath: string,
  branch: string,
): Promise<string> {
  try {
    const data = await githubFetch<{ content?: string; encoding?: string }>(
      `/repos/${spec.owner}/${spec.repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`,
    );
    if (data.content && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return "";
  } catch (err) {
    // File too large (>100KB) or not found — return empty
    if (err instanceof GitHubApiError && (err.statusCode === 403 || err.statusCode === 404)) {
      return "";
    }
    throw err;
  }
}
