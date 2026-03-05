```
 _____ _____ _   _ ____  ___ _     _____
|_   _| ____| \ | / ___||_ _| |   | ____|
  | | |  _| |  \| \___ \ | || |   |  _|
  | | | |___| |\  |___) || || |___| |___
  |_| |_____|_| \_|____/|___|_____|_____|
```

**Automated UI Quality Agent for Web Apps** — Smoke / Discovery / Journeys / Issues / Modify & Repair / CI

Tensile is a production-oriented QA agent that can:

- **Stress-test any public website** (no login required)
- **Discover pages + actionable UI targets** via bounded crawl
- **Generate and run journeys** (tests) automatically
- **Deduplicate failures into issues** with severity levels (S0–S3)
- **Modify** a step — even when it passes
- **Repair** failing steps by selecting alternative UI targets
- **Pin** modified tests and rerun them later
- **Run in CI** — GitHub Actions integration with artifacts + PR comments
- Optionally enrich reports with **public GitHub repo metadata**

It ships as:

- A **web dashboard** for interactive usage
- A **CLI runner** (engine) under the hood
- An **npm package** (`@tensile/cli`) for CI pipelines
- A **GitHub Action** (`tensile-ai/tensile-ci@v1`) for zero-config adoption

---

## Quick Start

### Prerequisites

- Node.js 22+
- npm 9+

### Install & Run Dashboard

```bash
npm install --include=dev
npm run build
npm run dev
```

Open `http://localhost:5173` in a browser.

### Production Build

```bash
npm run build          # Build server + runner + shared
npm run build:web      # Build web frontend
npm start              # Start production server
```

---

## Run Tensile in Your Repo (CI)

Any team can adopt Tensile CI in their product repo in under 5 minutes — no dashboard, no cloning this repo.

### Step 1: Copy config template

Copy [`templates/tensile.config.json`](templates/tensile.config.json) to your repo root and update the target URL:

```json
{
  "targets": [
    {
      "name": "My App",
      "url": "https://your-app-url.com",
      "options": {
        "smoke": true,
        "discover": true,
        "journeys": "topN:5",
        "headless": true,
        "maxPages": 10,
        "maxDepth": 2
      }
    }
  ],
  "ci": {
    "failOn": "fail"
  }
}
```

### Step 2: Copy workflow template

Copy [`templates/workflows/tensile-ci.yml`](templates/workflows/tensile-ci.yml) to `.github/workflows/tensile-ci.yml`:

```yaml
name: Tensile QA
on:
  pull_request:
  workflow_dispatch:
  schedule:
    - cron: "0 3 * * *"

jobs:
  tensile:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: tensile-ai/tensile-ci@v1
        with:
          config: tensile.config.json
          failOn: fail
```

### Step 3: Push a PR or trigger `workflow_dispatch`

GitHub Actions will:
1. Install `@tensile/cli`
2. Install Playwright browsers
3. Run Tensile against your target URL(s)
4. Upload `ci-runs/` as a build artifact
5. Write the markdown report to the GitHub step summary

### CI Config Reference

**Target options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `smoke` | boolean | `false` | Run smoke check first |
| `discover` | boolean | `false` | Crawl and discover pages |
| `journeys` | string | — | `topN:N`, `critical`, `file:path`, or `none` |
| `headless` | boolean | `true` | Run browser headlessly |
| `maxPages` | number | `50` | Max pages to discover |
| `maxDepth` | number | `3` | Max crawl depth |
| `readOnly` | boolean | `true` | Read-only mode |

**CI settings:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `failOn` | string | `"fail"` | `"fail"` = exit 1 on failures only, `"warn"` = also fail on warnings, `"never"` = always exit 0 |
| `artifactRetentionDays` | number | `7` | Artifact retention in CI |

---

## Using the Dashboard

### Start a Run

1. Click **+ New Run** in the sidebar
2. Paste a target URL
3. Choose options: Smoke, Discovery, Journeys (`topN:3`, `topN:5`, etc.), Headless
4. (Optional) Add one or more public GitHub repo links for ownership hints
5. Click **Start Run**

### Dashboard Layout

| Panel | Content |
|-------|---------|
| **Left** | Projects grouped by slug, Runs (newest first), Pinned tests |
| **Center** | Run results: stages, journeys table, issues |
| **Right** | Inspector: Details, Console, Coverage, Artifacts, Planner |

### When All Tests Pass

- **Copy the report** — Use "Copy Report" in the header
- **Increase coverage** — Run `topN:10` or increase discovery depth/pages
- **Pin important flows** — Open a journey, click **Modify**, select alternative targets, then **Save as Pinned Test**

### When Tests Fail

1. **Open the journey** — Click the failing journey row, then Inspector > Details
2. **Inspect evidence** — Trace (Playwright trace viewer), Video, Console/page errors, Network events
3. **Check Issues tab** — Tensile deduplicates failures into issues with severity (S0–S3)
4. **Repair** — Click **Repair** on a failed step, choose an alternative target from the overlay preview, click **Apply**
5. **Modify** (even passing steps) — Wrong element chosen? Use **Modify** to select the correct target
6. **Pin the fix** — Save as pinned test and rerun to confirm stability
7. **Copy Issue Report** — Share the clustered issue report with evidence links

---

## How It Works (Pipeline)

```
+--------------------+
|  User selects URL  |
+----------+---------+
           |
           v
+----------+---------+
|  Smoke (quick)     |   Loads the page, basic checks, captures artifacts
+----------+---------+
           |
           v
+----------+---------+
| Discovery / Crawl  |   Visits pages (bounded), extracts actionable targets
+----------+---------+
           |
           v
+----------+---------+
| Candidate Generator |  Converts actions -> Suggested Tests (candidates)
+----------+---------+
           |
           v
+----------+---------+
| Top-N Selector      |  Picks the best N tests (score + safety rules)
+----------+---------+
           |
           v
+----------+---------+
| Journey Executor    |  Runs tests, captures trace/video/logs per journey
+----------+---------+
           |
           v
+----------+---------+
| Issue Clustering    |  Dedupes failures into issues (S0–S3 severity)
+----------+---------+
           |
           v
+----------+---------+
| Interactive QA      |  Modify / Repair steps -> Pin tests -> Re-run
+--------------------+
```

### Funnel Model

```
Discovered Actions  -->  Suggested Tests  -->  Executed Tests
    (all targets)        (filtered ideas)      (Top N + smoke)
```

---

## CLI Usage

### Standalone CLI (`@tensile/cli`)

```bash
# Install globally
npm install -g @tensile/cli

# Run CI mode
tensile ci --config tensile.config.json --out ./ci-runs

# Run a single target
tensile run --url https://example.com --out ./my-run --smoke true --discover true --journeys topN:5
```

### Engine CLI (from this repo)

```bash
# Validate config
node apps/runner/dist/index.js validate \
  --url https://staging.example.com \
  --out ./data/runs/demo

# Run smoke
node apps/runner/dist/index.js run \
  --url https://example.com \
  --out ./data/runs/smoke \
  --smoke true --headless true --trace true --video true

# Run discovery + journeys
node apps/runner/dist/index.js run \
  --url https://example.com \
  --out ./data/runs/full \
  --smoke true --discover true --journeys topN:5 --headless true

# Dry run (safety simulation)
node apps/runner/dist/index.js dryrun \
  --url https://example.com \
  --out ./data/runs/test \
  --read-only true --denylist "delete,remove"

# List artifacts
node apps/runner/dist/index.js artifacts list --out ./data/runs/smoke
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--url <string>` | *(required)* | Target website base URL |
| `--out <path>` | *(required)* | Output directory for this run |
| `--env <string>` | `staging` | Environment label |
| `--config <path>` | — | JSON config file to merge |
| `--read-only <bool>` | `true` | Read-only mode (blocks mutating actions) |
| `--smoke <bool>` | `false` | Execute smoke journey |
| `--discover <bool>` | `false` | Enable site discovery crawl |
| `--journeys <string>` | `topN:3`* | `topN:N`, `critical`, `file:<path>`, `none` |
| `--headless <bool>` | `true` | Run browser in headless mode |
| `--browser <string>` | `chromium` | Browser: chromium, firefox, webkit |
| `--max-pages <int>` | `50` | Max pages to crawl |
| `--max-depth <int>` | `3` | Max crawl depth from start URL |
| `--timeout-ms <int>` | `30000` | Navigation/action timeout (ms) |
| `--trace <bool>` | `true` | Capture Playwright trace |
| `--video <bool>` | `true` | Record video |
| `--network-events <bool>` | `true` | Capture network events |
| `--step-screenshots <bool>` | `false` | Screenshot after each step |
| `--journey-timeout-ms <int>` | `120000` | Per-journey wall-clock timeout (ms) |
| `--step-timeout-ms <int>` | `30000` | Per-step timeout (ms) |
| `--max-steps-per-journey <int>` | `8` | Max steps per journey |

\* `--journeys` defaults to `topN:3` when `--discover true`, otherwise `none`.

---

## Environment Variables

Variables can be set in a `.env` file (see `.env.example`).

| Variable | Maps to |
|----------|---------|
| `TARGET_URL` | `--url` |
| `OUT_DIR` | `--out` |
| `ENV` | `--env` |
| `READ_ONLY` | `--read-only` |
| `DENYLIST` | `--denylist` |
| `ALLOWLIST` | `--allowlist` |
| `MAX_PAGES` | `--max-pages` |
| `JIRA_ENABLED` | `--jira-enabled` |
| `JIRA_API_TOKEN` | Token for Jira (env only, never printed) |
| `LLM_PROVIDER` | `--llm-provider` |
| `OPENAI_API_KEY` | OpenAI key (env only, never printed) |
| `ANTHROPIC_API_KEY` | Anthropic key (env only, never printed) |

Config precedence (highest to lowest): CLI flags > env vars > `--config` JSON file > defaults.

---

## Safety Policy

Tensile is designed to be **safe-by-default**.

### Read-Only Mode (default: true)

- **Allowed**: NAVIGATE, CLICK, WAIT, PRESS_KEY, DOWNLOAD
- **Blocked**: SUBMIT_FORM, DELETE, PURCHASE, UPDATE_SETTINGS, UPLOAD

### Denylist

Default deny patterns: `delete`, `remove`, `destroy`, `close account`, `cancel subscription`, `refund`, `terminate`, `wipe`, `drop`

### Hard-Block (cannot be overridden)

- `delete account`, `close account`, `wipe`, `terminate account`

### Safety Events

All safety decisions are written to `safety.events.jsonl` (one JSON object per line).

---

## Storage Layout

Each site is treated as a **Project**. Runs are stored under:

```
data/runs/<projectSlug>/<runId>/
  run.json                    # Run metadata
  run.index.json              # Master index (journeys + pointers)
  config.normalized.json      # Full config (secrets redacted)
  safety.policy.json          # Policy snapshot
  safety.events.jsonl         # All safety decisions
  issues.json                 # Deduped failure clusters
  artifacts/
    discovery/
      site.map.json           # All visited pages
      page.actions.json       # All extracted action targets
      journeys.candidates.json
      journeys.excluded.json
      journeys.executed.json
      discovery.md            # Human-readable report
    journeys/<journeyId>/
      result.json             # Journey result + steps
      trace.zip               # Playwright trace
      video.webm              # Video recording
      console.log             # Browser console
      network.events.json     # Network activity
  .pinned_tests/
    <testId>.json             # Pinned (modified) tests
```

---

## Project Structure

```
tensile/
  apps/
    runner/          # CLI engine (Playwright-based)
    server/          # Express API server (port 3001)
    web/             # Vite + React 19 dashboard (port 5173)
  packages/
    shared/          # Shared TypeScript types + schemas
    cli/             # Publishable npm CLI (@tensile/cli)
  action/
    tensile-ci/      # Composite GitHub Action
  templates/         # Adoption templates for target repos
  data/              # Run storage (gitignored)
```

### npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server + web concurrently |
| `npm run dev:server` | Start API server (watch mode) |
| `npm run dev:web` | Start Vite dev server |
| `npm run build` | Build server + runner + shared |
| `npm run build:cli` | Build the standalone CLI package |
| `npm run build:web` | Build web frontend |
| `npm start` | Start production server |
| `npm run clean` | Remove all dist/ directories |

---

## Server API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check with run count |
| `POST` | `/api/runs` | Start a new run |
| `GET` | `/api/runs` | List all runs (summaries) |
| `GET` | `/api/runs/:id` | Run detail with runIndex |
| `POST` | `/api/runs/:id/stop` | Stop a running process |
| `GET` | `/api/runs/:id/stream` | SSE stream of log lines and events |
| `GET` | `/runs/:id/*` | Static file serving for artifacts |

### Limits

- Max 2 concurrent runs (returns 429 when at limit)
- `maxPages` clamped to 20, `maxDepth` clamped to 5 from dashboard
- Log buffer: 2,000 lines per run (ring buffer)

---

## License

[MIT](LICENSE)
