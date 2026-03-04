// --- Input types ---

export interface RepoSpec {
  owner: string;
  repo: string;
  url: string;
  role: string;
}

// --- GitHub API response subsets ---

export interface GitHubRepoResponse {
  full_name: string;
  description: string | null;
  default_branch: string;
  html_url: string;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  updated_at: string;
}

export interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
    committer: { date: string } | null;
  };
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

// --- Enrichment output types ---

export interface DetectedStack {
  frameworks: string[];
  runtimes: string[];
  languages: string[];
}

export interface KeyFile {
  path: string;
  kind: "package_manifest" | "openapi" | "route_definition" | "config" | "dockerfile";
}

export interface RepoMeta {
  owner: string;
  repo: string;
  role: string;
  url: string;
  description: string | null;
  defaultBranch: string;
  latestSha: string;
  latestCommitDate: string;
  latestCommitMessage: string;
  language: string | null;
  topics: string[];
  stack: DetectedStack;
  keyFiles: KeyFile[];
  fetchedAt: string;
}

export interface RepoMetaFile {
  repos: RepoMeta[];
  fetchedAt: string;
}

// --- Ownership types ---

export interface OwnershipHint {
  journeyId: string;
  journeyName: string;
  failedUrl?: string;
  httpMethod?: string;
  httpStatus?: number;
  likelyRepo: string;
  reason: string;
  relatedFiles: string[];
  confidence: "high" | "medium" | "low";
}

export interface OwnershipHintsFile {
  hints: OwnershipHint[];
  computedAt: string;
}

// --- Rate limit tracking ---

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}
