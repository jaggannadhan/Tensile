import type { Page } from "playwright";
import type { NetworkEvent } from "@web-qa-agent/shared";

export interface ConsoleEntry {
  timestamp: string;
  type: string;
  text: string;
}

export interface RecorderState {
  consoleLogs: ConsoleEntry[];
  pageErrors: string[];
  networkEvents: NetworkEvent[];
}

export function attachRecorder(page: Page): RecorderState {
  const state: RecorderState = {
    consoleLogs: [],
    pageErrors: [],
    networkEvents: [],
  };

  page.on("console", (msg) => {
    state.consoleLogs.push({
      timestamp: new Date().toISOString(),
      type: msg.type(),
      text: msg.text(),
    });
  });

  page.on("pageerror", (err) => {
    state.pageErrors.push(
      `[${new Date().toISOString()}] ${err.message}\n${err.stack ?? ""}`,
    );
  });

  page.on("response", (response) => {
    state.networkEvents.push({
      ts: new Date().toISOString(),
      type: "response",
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      resourceType: response.request().resourceType(),
      fromServiceWorker: response.fromServiceWorker(),
    });
  });

  page.on("requestfailed", (request) => {
    state.networkEvents.push({
      ts: new Date().toISOString(),
      type: "requestfailed",
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failureText: request.failure()?.errorText,
    });
  });

  return state;
}

export function formatConsoleLogs(entries: ConsoleEntry[]): string {
  return entries
    .map((e) => `[${e.timestamp}] [${e.type}] ${e.text}`)
    .join("\n");
}

export function formatPageErrors(errors: string[]): string {
  return errors.join("\n---\n");
}
