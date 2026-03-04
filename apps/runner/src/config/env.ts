import dotenv from "dotenv";

export interface EnvVars {
  TARGET_URL?: string;
  OUT_DIR?: string;
  ENV?: string;
  READ_ONLY?: string;
  DENYLIST?: string;
  ALLOWLIST?: string;
  MAX_PAGES?: string;
  UI_CONCURRENCY?: string;
  RERUN_FAILURES?: string;
  JIRA_ENABLED?: string;
  JIRA_BASE_URL?: string;
  JIRA_PROJECT?: string;
  JIRA_EMAIL?: string;
  JIRA_API_TOKEN?: string;
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

export function loadEnv(): EnvVars {
  dotenv.config();
  return {
    TARGET_URL: process.env.TARGET_URL,
    OUT_DIR: process.env.OUT_DIR,
    ENV: process.env.ENV,
    READ_ONLY: process.env.READ_ONLY,
    DENYLIST: process.env.DENYLIST,
    ALLOWLIST: process.env.ALLOWLIST,
    MAX_PAGES: process.env.MAX_PAGES,
    UI_CONCURRENCY: process.env.UI_CONCURRENCY,
    RERUN_FAILURES: process.env.RERUN_FAILURES,
    JIRA_ENABLED: process.env.JIRA_ENABLED,
    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
    JIRA_PROJECT: process.env.JIRA_PROJECT,
    JIRA_EMAIL: process.env.JIRA_EMAIL,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_MODEL: process.env.LLM_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
}
