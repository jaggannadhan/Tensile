import type { GitHubTreeEntry, DetectedStack, KeyFile } from "./types.js";

// --- Framework detection from dependency names ---

const FRAMEWORK_INDICATORS: Record<string, string> = {
  next: "Next.js",
  react: "React",
  "react-dom": "React",
  vue: "Vue",
  nuxt: "Nuxt",
  "@angular/core": "Angular",
  svelte: "Svelte",
  express: "Express",
  fastify: "Fastify",
  koa: "Koa",
  hono: "Hono",
  "@nestjs/core": "NestJS",
};

const RUNTIME_INDICATORS: Record<string, string> = {
  // Detected from manifest file presence, not from deps
};

const LANG_EXTENSIONS: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  py: "Python",
  go: "Go",
  rb: "Ruby",
  java: "Java",
  kt: "Kotlin",
  cs: "C#",
  rs: "Rust",
};

// --- Key file patterns ---

const KEY_FILE_PATTERNS: Array<{ pattern: RegExp; kind: KeyFile["kind"] }> = [
  { pattern: /^package\.json$/, kind: "package_manifest" },
  { pattern: /^(apps|packages)\/[^/]+\/package\.json$/, kind: "package_manifest" },
  { pattern: /openapi\.(json|ya?ml)$/i, kind: "openapi" },
  { pattern: /swagger\.(json|ya?ml)$/i, kind: "openapi" },
  { pattern: /^Dockerfile$/i, kind: "dockerfile" },
  { pattern: /^docker-compose\.ya?ml$/i, kind: "config" },
  { pattern: /^requirements\.txt$/, kind: "package_manifest" },
  { pattern: /^Gemfile$/, kind: "package_manifest" },
  { pattern: /^go\.mod$/, kind: "package_manifest" },
  { pattern: /^pyproject\.toml$/, kind: "package_manifest" },
  { pattern: /^pom\.xml$/, kind: "package_manifest" },
  { pattern: /^build\.gradle(\.kts)?$/, kind: "package_manifest" },
  { pattern: /^Cargo\.toml$/, kind: "package_manifest" },
];

const ROUTE_FILE_PATTERNS = [
  /\/(routes|api|controllers|endpoints)\/.+\.(ts|js|py|rb|java|go)$/,
  /\/pages\/api\/.+\.(ts|js)$/,
  /\/app\/api\/.+\/route\.(ts|js)$/,
];

// --- Public functions ---

export function detectStack(
  tree: GitHubTreeEntry[],
  packageJsonContent: string | null,
): DetectedStack {
  const frameworks = new Set<string>();
  const runtimes = new Set<string>();
  const languages = new Set<string>();

  // Detect from package.json dependencies
  if (packageJsonContent) {
    try {
      const pkg = JSON.parse(packageJsonContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      for (const depName of Object.keys(allDeps)) {
        const framework = FRAMEWORK_INDICATORS[depName];
        if (framework) frameworks.add(framework);
      }
      runtimes.add("Node.js");
    } catch {
      // Malformed JSON — skip dependency analysis
    }
  }

  // Detect from file extensions and manifest files
  const extensionCounts = new Map<string, number>();

  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const path = entry.path;

    // Count file extensions
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext && LANG_EXTENSIONS[ext]) {
      extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
    }

    // Detect runtimes from manifest files
    if (path === "go.mod" || path.endsWith("/go.mod")) runtimes.add("Go");
    if (path === "requirements.txt" || path === "pyproject.toml") runtimes.add("Python");
    if (path === "Gemfile") runtimes.add("Ruby");
    if (path === "pom.xml" || path === "build.gradle" || path === "build.gradle.kts") runtimes.add("JVM");
    if (path === "Cargo.toml") runtimes.add("Rust");
    if (/\.csproj$/.test(path)) runtimes.add(".NET");
  }

  // Only report languages with significant file counts (>= 3 files)
  for (const [ext, count] of extensionCounts) {
    if (count >= 3) {
      languages.add(LANG_EXTENSIONS[ext]);
    }
  }

  return {
    frameworks: [...frameworks],
    runtimes: [...runtimes],
    languages: [...languages],
  };
}

export function identifyKeyFiles(tree: GitHubTreeEntry[]): KeyFile[] {
  const keyFiles: KeyFile[] = [];
  let routeCount = 0;

  for (const entry of tree) {
    if (entry.type !== "blob") continue;

    // Check against key file patterns
    for (const { pattern, kind } of KEY_FILE_PATTERNS) {
      if (pattern.test(entry.path)) {
        keyFiles.push({ path: entry.path, kind });
        break;
      }
    }

    // Check route file patterns (capped at 20)
    if (routeCount < 20) {
      for (const pattern of ROUTE_FILE_PATTERNS) {
        if (pattern.test(entry.path)) {
          keyFiles.push({ path: entry.path, kind: "route_definition" });
          routeCount++;
          break;
        }
      }
    }
  }

  // Sort: manifests first, then openapi, then routes, then rest
  const kindOrder: Record<string, number> = {
    package_manifest: 0,
    openapi: 1,
    route_definition: 2,
    config: 3,
    dockerfile: 4,
  };
  keyFiles.sort((a, b) => (kindOrder[a.kind] ?? 5) - (kindOrder[b.kind] ?? 5));

  return keyFiles.slice(0, 50);
}

export function identifyRouteFiles(tree: GitHubTreeEntry[]): string[] {
  const routes: string[] = [];
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    for (const pattern of ROUTE_FILE_PATTERNS) {
      if (pattern.test(entry.path)) {
        routes.push(entry.path);
        break;
      }
    }
    if (routes.length >= 30) break;
  }
  return routes;
}
