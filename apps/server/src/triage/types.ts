export interface ArtifactRef {
  kind: string;
  path: string;
}

export interface Occurrence {
  journeyId: string;
  journeyName: string;
  stepIndex: number;
  stepName: string;
  status: "FAIL" | "SOFT_FAIL";
  errorMessage: string;
  failureKind?: string;
  url?: string;
  httpStatus?: number;
  artifacts: ArtifactRef[];
}

export interface Issue {
  issueId: string;
  signature: string;
  severity: "S0" | "S1" | "S2" | "S3";
  title: string;
  occurrences: Occurrence[];
  count: number;
  firstSeen: string;
  evidenceLinks: ArtifactRef[];
  ownershipHint?: {
    likelyRepo: string;
    confidence: string;
    reason: string;
  };
}

export interface IssuesFile {
  issues: Issue[];
  totalOccurrences: number;
  totalIssues: number;
  computedAt: string;
}
