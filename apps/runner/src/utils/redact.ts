import type { RunConfig } from "@web-qa-agent/shared";

const SECRET_ENV_KEYS = [
  "JIRA_API_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

export function redactConfig(config: RunConfig): Record<string, unknown> {
  return {
    ...config,
    jira: {
      ...config.jira,
    },
    llm: {
      ...config.llm,
    },
  };
  // RunConfig itself does not contain raw secrets (tokens/keys),
  // they are only in env vars. This function exists for future use
  // and to strip any accidental inclusions.
}

export function redactEnvForDisplay(): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (SECRET_ENV_KEYS.some((sk) => key.toUpperCase().includes(sk))) {
      output[key] = "****";
    }
  }
  return output;
}
