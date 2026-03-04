import type { MainTab, IssuesFile } from "../types";

interface Props {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  issues: IssuesFile | null;
  children: React.ReactNode;
}

export function MainTabs({ activeTab, onTabChange, issues, children }: Props) {
  const issueCount = issues?.totalIssues ?? 0;

  return (
    <div className="main-tabs">
      <div className="main-tabs-bar">
        <button
          className={`main-tab${activeTab === "journeys" ? " main-tab-active" : ""}`}
          onClick={() => onTabChange("journeys")}
        >
          Journeys
        </button>
        <button
          className={`main-tab${activeTab === "issues" ? " main-tab-active" : ""}`}
          onClick={() => onTabChange("issues")}
        >
          Issues
          {issueCount > 0 && <span className="main-tab-badge">{issueCount}</span>}
        </button>
      </div>
      <div className="main-tabs-body">
        {children}
      </div>
    </div>
  );
}
