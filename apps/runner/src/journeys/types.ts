import type { CandidateJourney, JourneySpec } from "@web-qa-agent/shared";

/** Result of loading candidates from a source. */
export interface LoadedCandidates {
  source: "discovery" | "file";
  path: string;
  candidates: CandidateJourney[];
}

/** Diagnostics for planner candidate selection. */
export interface PlannerSelection {
  mode: string;
  param: string;
  totalCandidates: number;
  selected: Array<{
    id: string;
    name: string;
    priority: string;
    score: number;
    adjustedScore: number;
  }>;
  skippedByScore: Array<{
    id: string;
    name: string;
    priority: string;
    score: number;
    adjustedScore: number;
    reason: string;
  }>;
}

/** Result of the planning phase. */
export interface PlanResult {
  specs: JourneySpec[];
  skipped: Array<{ id: string; name: string; reason: string }>;
  selection: PlannerSelection;
}

/** Observable change detection result. */
export interface ObservableChangeResult {
  changed: boolean;
  urlChanged: boolean;
  domChanged: boolean;
  networkActivity: boolean;
  details: string;
}
