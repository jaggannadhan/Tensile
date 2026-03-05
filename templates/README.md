# Tensile CI — Quick Start

Add automated UI quality checks to your repo in 3 steps.

## 1. Add config

Copy `tensile.config.json` to your repo root and update the target URL:

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
        "headless": true
      }
    }
  ],
  "ci": {
    "failOn": "fail"
  }
}
```

## 2. Add workflow

Copy `workflows/tensile-ci.yml` to `.github/workflows/tensile-ci.yml` in your repo.

## 3. Push a PR

Tensile will run on every PR, nightly, and on manual dispatch.

## Configuration

### Targets

Each target specifies a URL to test and options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `smoke` | boolean | false | Run smoke check first |
| `discover` | boolean | false | Crawl and discover pages |
| `journeys` | string | — | Journey selection: `topN:N`, `critical`, `file:path` |
| `headless` | boolean | true | Run browser headlessly |
| `maxPages` | number | 50 | Max pages to discover |
| `maxDepth` | number | 3 | Max crawl depth |
| `readOnly` | boolean | true | Read-only mode (no form submissions) |

### CI Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `failOn` | string | `"fail"` | `"fail"` = exit 1 on failures, `"warn"` = also fail on warnings, `"never"` = always exit 0 |
| `artifactRetentionDays` | number | 7 | How long to keep CI artifacts |

## Outputs

After a run, check:
- **Artifacts tab** in GitHub Actions for full run data
- **Job summary** for a quick markdown report
- `ci-runs/summary.json` for programmatic access
- `ci-runs/report.md` for the full report
