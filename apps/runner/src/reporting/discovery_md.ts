import type {
  PageNode,
  ActionTarget,
  CandidateJourney,
  DiscoveryResult,
  ExcludedCandidate,
} from "@web-qa-agent/shared";
import type { CandidateDiagnostics } from "../discovery/candidates.js";

export function generateDiscoveryMarkdown(
  result: DiscoveryResult,
  pages: PageNode[],
  actions: ActionTarget[],
  candidates: CandidateJourney[],
  diagnostics?: CandidateDiagnostics,
  excluded?: ExcludedCandidate[],
): string {
  const lines: string[] = [];

  lines.push("# Discovery Report");
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Pages visited**: ${result.pagesVisited} / ${result.maxPages} (max)`);
  const actualMaxDepth = pages.length > 0 ? Math.max(...pages.map((p) => p.depth)) : 0;
  lines.push(`- **Max depth reached**: ${actualMaxDepth} / ${result.maxDepth} (limit)`);
  lines.push(`- **Links found**: ${result.linksFound}`);
  lines.push(`- **Actions found**: ${result.actionsFound}`);
  lines.push(`- **Blocked navigations**: ${result.blockedNavigations}`);
  lines.push(`- **Duration**: ${result.durationMs}ms`);
  lines.push("");

  // SPA detection
  const spaCandidates = candidates.filter((c) => c.tags.includes("spa"));
  if (spaCandidates.length > 0) {
    lines.push("### SPA Detection");
    lines.push("");
    lines.push(`- **SPA mode**: true`);
    lines.push(`- **Candidates from in-page actions**: ${spaCandidates.length}`);
    const topLabels = spaCandidates.slice(0, 5).map((c) => c.name.replace(/^Click "/, "").replace(/"$/, ""));
    lines.push(`- **Top SPA targets**: ${topLabels.join(", ")}`);
    lines.push("");
  }

  // Candidate Generation Diagnostics
  if (diagnostics) {
    lines.push("### Candidate Generation Diagnostics");
    lines.push("");
    lines.push(`- **pagesVisited**: ${diagnostics.pagesVisited}`);
    lines.push(`- **linksFound**: ${diagnostics.linksFound}`);
    lines.push(`- **actionsTotal**: ${diagnostics.actionsTotal}`);
    lines.push(`- **actionsOnRoot**: ${diagnostics.actionsOnRoot}`);
    lines.push(`- **rootUrlUsed**: ${diagnostics.rootUrlUsed}`);
    lines.push(`- **actionsMapKeysSample**: ${diagnostics.actionsMapKeys.length > 0 ? diagnostics.actionsMapKeys.join(", ") : "(none)"}`);
    lines.push(`- **navLinkCandidates**: ${diagnostics.navLinkCandidates}`);
    lines.push(`- **spaModeTriggered**: ${diagnostics.spaModeTriggered} (${diagnostics.spaTriggerReason})`);
    lines.push("");

    if (diagnostics.spaModeTriggered) {
      const e = diagnostics.spaEligible;
      lines.push("**SPA Eligibility Funnel:**");
      lines.push("");
      lines.push(`- totalOnRoot: ${e.totalOnRoot}`);
      lines.push(`- typeEligible (CLICK/NAVIGATE): ${e.typeEligible}`);
      lines.push(`- excludedDestructive: ${e.excludedDestructive}`);
      lines.push(`- excludedDisabled: ${e.excludedDisabled}`);
      lines.push(`- excludedDuplicate: ${e.excludedDuplicate}`);
      lines.push(`- excludedEmpty: ${e.excludedEmpty}`);
      lines.push(`- **finalSpaCandidates**: ${e.finalSpaCandidates}`);
      lines.push("");

      // Top SPA Candidates table with scores
      if (diagnostics.topScoredCandidates.length > 0) {
        lines.push("**Top SPA Candidates:**");
        lines.push("");
        lines.push("| Label | Type | Score | Selector | Flags |");
        lines.push("|-------|------|-------|----------|-------|");
        for (const sc of diagnostics.topScoredCandidates) {
          const label = truncate(sc.action.humanLabel, 35);
          const selectorShort = truncate(sc.action.selector, 30);
          const penaltyFlags = sc.flags.filter((f) => f.startsWith("-")).join(", ");
          lines.push(`| ${label} | ${sc.action.actionType} | ${Math.round(sc.score)} | \`${selectorShort}\` | ${penaltyFlags || "-"} |`);
        }
        lines.push("");
      }
    }

    if (diagnostics.topCandidateLabels.length > 0) {
      lines.push(`**Top candidate labels**: ${diagnostics.topCandidateLabels.join(", ")}`);
      lines.push("");
    }
  }

  // Action breakdown by type
  const typeCounts = new Map<string, number>();
  for (const a of actions) {
    typeCounts.set(a.actionType, (typeCounts.get(a.actionType) ?? 0) + 1);
  }
  if (typeCounts.size > 0) {
    lines.push("### Actions by type");
    lines.push("");
    for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- **${type}**: ${count}`);
    }
    lines.push("");
  }

  // Site Map table
  lines.push("## Site Map");
  lines.push("");
  if (pages.length > 0) {
    lines.push("| URL | Depth | Title | HTTP | Errors | Actions |");
    lines.push("|-----|-------|-------|------|--------|---------|");
    for (const p of pages) {
      const title = truncate(p.title ?? "(none)", 30);
      const http = p.httpStatus ?? "-";
      lines.push(`| ${truncate(p.url, 60)} | ${p.depth} | ${title} | ${http} | ${p.errorCount} | ${p.actionCount} |`);
    }
  } else {
    lines.push("No pages discovered.");
  }
  lines.push("");

  // Top pages by action count
  const topByActions = [...pages].sort((a, b) => b.actionCount - a.actionCount).slice(0, 5);
  if (topByActions.length > 0 && topByActions[0].actionCount > 0) {
    lines.push("### Top pages by actions");
    lines.push("");
    for (const p of topByActions) {
      lines.push(`- **${truncate(p.url, 60)}**: ${p.actionCount} actions`);
    }
    lines.push("");
  }

  // Pages with errors
  const pagesWithErrors = pages.filter((p) => p.errorCount > 0);
  if (pagesWithErrors.length > 0) {
    lines.push("### Pages with errors");
    lines.push("");
    for (const p of pagesWithErrors) {
      lines.push(`- **${truncate(p.url, 60)}**: ${p.errorCount} errors`);
    }
    lines.push("");
  }

  // Notable risky targets
  const destructive = actions.filter((a) => a.riskFlags.looksDestructive);
  if (destructive.length > 0) {
    lines.push("## Risky Targets");
    lines.push("");
    lines.push("| Page | Label | Type | Selector |");
    lines.push("|------|-------|------|----------|");
    for (const a of destructive.slice(0, 10)) {
      lines.push(`| ${truncate(a.pageUrl, 40)} | ${truncate(a.humanLabel, 30)} | ${a.actionType} | \`${truncate(a.selector, 30)}\` |`);
    }
    lines.push("");
  }

  // Candidate Journeys
  lines.push("## Candidate Journeys");
  lines.push("");

  const byPriority = new Map<string, CandidateJourney[]>();
  for (const c of candidates) {
    const list = byPriority.get(c.priority) ?? [];
    list.push(c);
    byPriority.set(c.priority, list);
  }

  for (const [priority, label] of [["P0", "Critical"], ["P1", "Important"], ["P2", "Nice to Have"]] as const) {
    const group = byPriority.get(priority);
    if (group && group.length > 0) {
      lines.push(`### ${priority} - ${label}`);
      lines.push("");
      for (const j of group) {
        const stepDescs = j.steps.map((s) => s.description).join(" -> ");
        lines.push(`- **${j.name}**: ${stepDescs}`);
      }
      lines.push("");
    }
  }

  // Excluded candidates
  if (excluded && excluded.length > 0) {
    lines.push("## Excluded Tests");
    lines.push("");
    lines.push(`Total excluded: **${excluded.length}**`);
    lines.push("");

    // Breakdown by reason
    const byReason = new Map<string, number>();
    for (const e of excluded) {
      byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + 1);
    }
    lines.push("| Reason | Count |");
    lines.push("|--------|-------|");
    for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${reason} | ${count} |`);
    }
    lines.push("");
  }

  // Output file pointers
  lines.push("## Output Files");
  lines.push("");
  lines.push(`- Site map: \`${result.siteMapPath}\``);
  lines.push(`- Actions: \`${result.actionsPath}\``);
  lines.push(`- Candidates: \`${result.candidatesPath}\``);
  lines.push(`- This report: \`${result.discoveryMdPath}\``);
  lines.push("");

  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
