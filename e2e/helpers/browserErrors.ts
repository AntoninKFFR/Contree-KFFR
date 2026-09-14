import { expect, type Page } from "@playwright/test";

export type BrowserErrorMonitor = { assertClean: () => void };

export function monitorBrowserErrors(page: Page): BrowserErrorMonitor {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return {
    assertClean() {
      expect(errors, "browser errors (credentials and request bodies are never collected)").toEqual([]);
    },
  };
}
