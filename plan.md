# MVP UI Consistency Patch — Implementation Plan

## Overview
Fix UI counter confusion, ensure journeys execute correctly with "Top N" + Discover,
add always-available "Copy Report" button with comprehensive Markdown output.

---

## Phase 1: Server — Post-run stage stats (registry + spawn)

### 1a. Add `StageStats` to `RunRecord` (`apps/server/src/registry.ts`)
- Add types:
  ```ts
  interface StageStats {
    smoke?: { status: "pass" | "fail" | "skip"; durationMs?: number };
    discovery?: { status: "pass" | "fail" | "skip"; pages?: number; actions?: number; candidates?: number };
    journeys?: { status: "pass" | "fail" | "skip"; executed: number; passed: number; failed: number; skipped: number; warned: number };
  }
  ```
- Add `stages?: StageStats` field to `RunRecord`
- Add `setStages(id, stages)` method to registry
- Include `stages` in `summarize()` output

### 1b. Compute stages after run.index.json is loaded (`apps/server/src/spawn.ts`)
- After `setIndexReady()` succeeds (both in polling and in close handler), call a new function `computeStages(record)` which:
  1. Reads `record.runIndex.journeys`
  2. Smoke: find journey with `journeyId === "smoke"` → status pass/fail, durationMs
  3. Journeys (non-smoke): filter `journeyId !== "smoke"`, count by status
     - For SOFT_FAIL/warned: need to read each journey's result.json to check for warnings
     - Simplification: just use run.index status (PASS/FAIL), count warnings from result.json only if affordable
     - Actually, run.index only has PASS/FAIL. For warned count, we'd need individual results.
     - **Decision**: Keep it simple. Compute executed/passed/failed from run.index entries. Skip warned count for now (would require reading each result.json). Can add later.
  4. Discovery: if `record.runIndex.discovery` exists, read discovery artifacts:
     - `site.map.json` → count entries → `pages`
     - `page.actions.json` → count entries → `actions`
     - `journeys.candidates.json` → count entries → `candidates`
  5. Store via `registry.setStages(record.runId, stages)`
- Broadcast a new SSE event: `{ type: "stagesReady" }`

### 1c. Normalize journeys in spawn (`apps/server/src/spawn.ts`)
- In `startRun()`, before building CLI args:
  - If `opts.discover` is true and `opts.journeys` is falsy, default to `"topN:3"`
  - If `opts.journeys === "none"`, don't pass `--journeys` flag at all
- This ensures "Discover + no explicit journeys" still runs top 3 journeys

### 1d. Expose stages in API (`apps/server/src/routes/runs.ts`)
- Add `stages: run.stages` to GET `/api/runs/:id` response

---

## Phase 2: Frontend types + API updates

### 2a. Types (`apps/web/src/types.ts`)
- Add `StageStats` type (mirror server)
- Add `stages?: StageStats` to `RunDetail` and `RunSummary`
- Add `stagesReady` to `SSEEvent` union

### 2b. useSSE (`apps/web/src/hooks/useSSE.ts`)
- Add `stagesReady` state, handle in switch, return it

### 2c. API (`apps/web/src/api.ts`)
- No changes needed — `fetchRun` already returns full RunDetail

---

## Phase 3: UI — Stage cards + counters + table separation

### 3a. New component: `StageCards.tsx` (`apps/web/src/components/StageCards.tsx`)
- Receives `stages: StageStats | undefined`, `options: RunOptions`
- Renders 3 horizontal cards:
  1. **Smoke**: badge (PASS/FAIL/—), duration
  2. **Discovery**: badge, pages/actions/candidates counts
  3. **Journeys**: badge, executed/passed/failed counters
- Each card only shows if relevant (smoke enabled, discover enabled, journeys requested)
- If stage data not yet available, show "—" or "pending"

### 3b. Modify `RunSummary.tsx` (`apps/web/src/components/RunSummary.tsx`)
- Accept `stagesReady` prop (from MainPanel)
- Re-fetch run detail when `stagesReady` becomes true (or on initial load)
- Render `<StageCards>` between summary-meta and journey table
- Separate smoke from non-smoke journeys in the table:
  - Smoke section first (if smoke journey exists)
  - "Journeys" section below (non-smoke journeys)
  - If no non-smoke journeys, show "No discovered journeys executed" message

### 3c. Modify `MainPanel.tsx`
- Extract `stagesReady` from useSSE, pass to RunSummary

### 3d. Modify `NewRunForm.tsx`
- Add "Will run" preview line below the form showing what stages will execute:
  e.g., "Smoke + Discovery + Journeys (topN:3)"
- When journeys dropdown is set to "none", don't include journeys in summary
- Send `journeys: "none"` value as undefined to prevent passing --journeys none

---

## Phase 4: Copy Run Report

### 4a. New component: `CopyRunReport.tsx` (`apps/web/src/components/CopyRunReport.tsx`)
- Button: "Copy Report" — always visible once indexReady
- On click:
  - Uses already-loaded `runIndex` (from `detail`)
  - Fetches additional data: `repo.meta.json`, `ownership.hints.json`, each journey `result.json`
  - Uses `window.location.origin` for absolute artifact URLs
  - Generates comprehensive Markdown (format per spec §3.2):
    - Title: `# Tensile Run Report`
    - Metadata section
    - Linked Repositories (if present)
    - Discovery Summary (if stages.discovery present)
    - Journeys table (all journeys with status, duration, notes)
    - Failures detail section (for FAIL journeys only)
    - Footer with artifact base URL + trace viewing hint
  - Falls back gracefully if any fetch fails (includes note about missing data)
  - Copies to clipboard

### 4b. Modify `RunSummary.tsx`
- Render `<CopyRunReport>` button next to "Run Summary" heading

---

## Phase 5: CSS for stage cards

### 5a. Add styles to `apps/web/src/index.css`
- `.stage-cards` flex container
- `.stage-card` with border, padding, role color accent
- `.stage-card-title` label
- `.stage-card-status` badge
- `.stage-card-stats` counter grid

---

## File Change Summary

**New files (2):**
- `apps/web/src/components/StageCards.tsx`
- `apps/web/src/components/CopyRunReport.tsx`

**Modified files (10):**
- `apps/server/src/registry.ts` — StageStats type, stages field, setStages method
- `apps/server/src/spawn.ts` — computeStages(), journeys normalization
- `apps/server/src/routes/runs.ts` — stages in GET response
- `apps/web/src/types.ts` — StageStats type, stagesReady SSE event
- `apps/web/src/hooks/useSSE.ts` — stagesReady handler
- `apps/web/src/components/MainPanel.tsx` — pass stagesReady
- `apps/web/src/components/RunSummary.tsx` — StageCards, table separation, CopyRunReport, re-fetch on stagesReady
- `apps/web/src/components/NewRunForm.tsx` — "Will run" preview, journeys "none" handling
- `apps/web/src/components/JourneyDetails.tsx` — no changes needed (already has ownership)
- `apps/web/src/index.css` — stage card styles

---

## Implementation Order
1. Phase 1: Server (registry types → spawn compute → routes expose)
2. Phase 2: Frontend types + SSE
3. Phase 3: StageCards + RunSummary rework + NewRunForm tweak
4. Phase 4: CopyRunReport
5. Phase 5: CSS
6. Build + verify + update Implementation.txt
