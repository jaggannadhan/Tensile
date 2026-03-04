# Tensile

**Interactive QA Agent for Web Apps** — Smoke / Discovery / Journeys / Issues / Modify & Repair

Tensile is a production-oriented interactive QA agent that can:

- **Stress-test any public website** (no login required)
- **Discover pages + actionable UI targets** via bounded crawl
- **Generate and run journeys** (tests) automatically
- **Deduplicate failures into issues** (noise reduction)
- **Modify** a step — even when it passes
- **Repair** failing steps by selecting alternative UI targets
- **Pin** modified tests and rerun them later
- Optionally enrich reports with **public GitHub repo metadata** (monolith or multi-repo)

It ships as:

- A **web dashboard** (recommended for daily usage), and
- A **CLI runner** (engine) under the hood.

---

## Why Tensile

Most QA tools either require hand-written scripts, produce noisy results without context, or don't help you fix drift ("wrong element clicked") quickly.

Tensile is built to:

1. **Start from zero** — paste a URL and run
2. **Show exactly what was discovered and tested** — with funnel visibility
3. **Provide trace/video/log artifacts** — evidence for every step
4. **Make the workflow interactive** — modify, pin, rerun

This is especially useful for:

- Startups wanting quick regression smoke coverage
- Teams without dedicated QA
- Validating a public site before release
- Quickly generating dev-ready bug reports

---

## How It Works (Pipeline)

Tensile runs a bounded pipeline:

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
| Issue Clustering    |  Dedupes failures into issues (noise reduction)
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

Tensile explains this funnel in the UI (tooltips), and also shows excluded tests with reason codes.

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 9+

### Install

```bash
npm install --include=dev
npm run build
```

### Start the Dashboard

```bash
# Start both server + frontend (recommended)
npm run dev

# Or start them separately:
npm run dev:server     # API server on http://localhost:3001
npm run dev:web        # Vite frontend on http://localhost:5173
```

Open `http://localhost:5173` in a browser.

### Production Build

```bash
npm run build          # Build server + runner + shared
npm run build:web      # Build web frontend
npm start              # Start production server
```

---

## Using the Dashboard

### Start a Run

1. Click **+ New Run** in the sidebar
2. Paste a target URL
3. Choose options: Smoke, Discovery, Journeys (`topN:3`, `topN:5`, etc.), Headless
4. (Optional) Add one or more public GitHub repo links for ownership hints
5. Click **Start Run**

### Dashboard Layout

The UI uses a three-panel layout:

| Panel | Content |
|-------|---------|
| **Left** | Projects grouped by slug, Runs (newest first), Pinned tests |
| **Center** | Run results: stages, journeys table, issues |
| **Right** | Inspector: Details, Console, Coverage, Artifacts, Planner |

### When All Tests Pass

- **Copy the report** — Use "Copy Report" in the header. Share in Slack / PR / email.
- **Increase coverage** — Run `topN:10` or increase discovery depth/pages.
- **Pin important flows** — Even when a test passes, you may want it as a stable regression check. Open a journey, click **Modify**, select alternative targets, then **Save as Pinned Test**.

### When Tests Fail

1. **Open the journey** — Click the failing journey row, then Inspector > Details
2. **Inspect evidence** — Trace (Playwright trace viewer), Video, Console/page errors, Network events
3. **Check Issues tab** — Tensile deduplicates failures into issues ("issue clustering")
4. **Repair** — Click **Repair** on a failed step, choose an alternative target from the TargetPicker, click **Apply**
5. **Modify** (even passing steps) — Wrong element chosen? Use **Modify** to select the correct target
6. **Pin the fix** — Save as pinned test and rerun to confirm stability
7. **Copy Issue Report** — Share the clustered issue report with evidence links

---

## CLI Usage (Engine)

The dashboard invokes the runner, but you can run it directly.

### Validate Config

```bash
node apps/runner/dist/index.js validate \
  --url https://staging.example.com \
  --out ./data/runs/demo
```

### Run Smoke

```bash
node apps/runner/dist/index.js run \
  --url https://example.com \
  --out ./data/runs/smoke \
  --smoke true \
  --headless true \
  --trace true \
  --video true
```

### Run Discovery + Journeys

```bash
node apps/runner/dist/index.js run \
  --url https://example.com \
  --out ./data/runs/full \
  --smoke true \
  --discover true \
  --journeys topN:5 \
  --headless true
```

### Run Journeys from File

```bash
node apps/runner/dist/index.js run \
  --url https://example.com \
  --out ./data/runs/file-run \
  --journeys "file:./my-journeys.json" \
  --headless true
```

### Dry Run (Safety Simulation)

```bash
node apps/runner/dist/index.js dryrun \
  --url https://example.com \
  --out ./data/runs/test \
  --read-only true \
  --denylist "delete,remove"
```

### List Artifacts

```bash
node apps/runner/dist/index.js artifacts list --out ./data/runs/smoke
```

---

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--url <string>` | *(required)* | Target website base URL |
| `--out <path>` | *(required)* | Output directory for this run |
| `--env <string>` | `staging` | Environment label |
| `--config <path>` | — | JSON config file to merge |
| `--read-only <bool>` | `true` | Read-only mode (blocks mutating actions) |
| `--allowlist <csv>` | — | Allowed action types |
| `--denylist <csv>` | default set | Denied action patterns |
| `--smoke <bool>` | `false` | Execute smoke journey |
| `--discover <bool>` | `false` | Enable site discovery crawl |
| `--journeys <string>` | `topN:3`* | Journey mode: `topN:N`, `critical`, `file:<path>`, `none` |
| `--headless <bool>` | `true` | Run browser in headless mode |
| `--browser <string>` | `chromium` | Browser engine: chromium, firefox, webkit |
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

## Storage Layout

Each site is treated as a **Project**. Runs are stored under:

```
data/
  runs/
    <projectSlug>/
      <runId>/
        run.json                    # Run metadata
        run.index.json              # Master index (journeys + pointers)
        config.normalized.json      # Full config (secrets redacted)
        safety.policy.json          # Policy snapshot
        safety.events.jsonl         # All safety decisions
        issues.json                 # Deduped failure clusters
        repo.meta.json              # GitHub repo metadata (optional)
        artifacts/
          discovery/
            site.map.json           # All visited pages
            page.actions.json       # All extracted action targets
            journeys.candidates.json  # Auto-generated test candidates
            journeys.excluded.json    # Excluded candidates + reasons
            journeys.executed.json    # What was actually run
            discovery.md              # Human-readable report
          journeys/
            smoke/
              result.json           # Journey result + steps
              trace.zip             # Playwright trace
              video.webm            # Video recording
              console.log           # Browser console
              pageerrors.log         # Uncaught errors
              network.events.json   # Network activity
            <journeyId>/
              result.json
              trace.zip
              video.webm
              ...
        .pinned_tests/
          <testId>.json             # Pinned (modified) tests
```

### Key Artifacts

| File | Description |
|------|-------------|
| `discovery.md` | What was visited, actions found, candidates chosen/excluded |
| `journeys.candidates.json` | Suggested tests Tensile could run |
| `journeys.excluded.json` | Excluded candidates + reason codes |
| `journeys.executed.json` | What was actually run (Top N selection) |
| `issues.json` | Deduped failure clusters (issues) |
| `result.json` | Per-journey step results, warnings, selectors, URLs |
| `trace.zip` | Open with `npx playwright show-trace <path>` |

---

## Safety Policy

Tensile is designed to be **safe-by-default**.

### Read-Only Mode (default: true)

- **Allowed**: NAVIGATE, CLICK, WAIT, PRESS_KEY, DOWNLOAD
- **Blocked**: SUBMIT_FORM, DELETE, PURCHASE, UPDATE_SETTINGS, UPLOAD

The allowlist can override blocked actions, but overrides are recorded as safety OVERRIDE events.

### Denylist

String patterns matched against action labels. Default deny patterns:
`delete`, `remove`, `destroy`, `close account`, `cancel subscription`, `refund`, `terminate`, `wipe`, `drop`

### Hard-Block (cannot be overridden)

- `delete account`, `close account`, `wipe`, `terminate account`

### Safety Events

All safety decisions are written to `safety.events.jsonl` (one JSON object per line).

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
- No persistence: server restart clears runs from memory; artifacts persist on disk

---

## Project Structure

```
tensile/
  apps/
    runner/          # CLI engine (Playwright-based)
    server/          # Express API server (port 3001)
    web/             # Vite + React 19 dashboard (port 5173)
    data/            # Run storage (gitignored)
  packages/
    shared/          # Shared TypeScript types + utilities
```

### npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server + web concurrently |
| `npm run dev:server` | Start API server (watch mode) |
| `npm run dev:web` | Start Vite dev server |
| `npm run build` | Build server + runner + shared |
| `npm run build:web` | Build web frontend |
| `npm start` | Start production server |
| `npm run clean` | Remove all dist/ directories |

---

## Roadmap

1. **Jira Integration** — Create tickets from issues (1 per cluster), attach trace/video/screenshot + owner hints
2. **GitHub Actions / CI Mode** — Run on PRs/nightly, upload artifacts, comment summary
3. **Load/Stress Lane** — API load generator (k6/Locust wrapper), UI concurrency runs, perf regression reporting
4. **Persistence + Multi-User** — Auth, orgs, run history + search, S3/GCS artifact storage + Postgres metadata
