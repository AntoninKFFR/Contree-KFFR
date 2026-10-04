import { expect, type Page } from "@playwright/test";

export type BrowserErrorMonitor = { assertClean: () => void; snapshot: () => string[] };

export function monitorBrowserErrors(page: Page, options: { allowDuoHttp409?: boolean } = {}): BrowserErrorMonitor {
  const errors: string[] = [];
  let duoHttp409 = 0;
  let matchingConsole409 = 0;
  if (options.allowDuoHttp409) page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 409 && response.request().method() === "POST"
      && path.startsWith("/api/training/duo/sessions/")) duoHttp409 += 1;
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (options.allowDuoHttp409 && message.text() === "Failed to load resource: the server responded with a status of 409 (Conflict)") {
      matchingConsole409 += 1;
      return;
    }
    errors.push(`console: ${message.text()}`);
  });
  return {
    snapshot: () => [...errors],
    assertClean() {
      expect(errors, "browser errors (credentials and request bodies are never collected)").toEqual([]);
      if (options.allowDuoHttp409) expect(matchingConsole409, "console 409s must correspond to duo API conflicts")
        .toBeLessThanOrEqual(duoHttp409);
    },
  };
}
