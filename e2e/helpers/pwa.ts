import type { Page } from "@playwright/test";

export const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
export const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
export const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

// Browser APIs are mocked only by test injection. Production has no bypass flag.
export async function simulatePwaEnvironment(page: Page, options: { ua: string; standalone?: "media" | "ios"; platform?: string; touch?: number }) {
  await page.addInitScript((options) => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: options.ua });
    Object.defineProperty(navigator, "userAgentData", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "platform", { configurable: true, value: options.platform ?? "iPhone" });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: options.touch ?? 5 });
    Object.defineProperty(navigator, "standalone", { configurable: true, value: options.standalone === "ios" });
    const original = window.matchMedia.bind(window);
    let standalone = options.standalone === "media";
    const listeners = new Set<EventListenerOrEventListenerObject>();
    window.matchMedia = (query: string) => query !== "(display-mode: standalone)" ? original(query) : {
      media: query, get matches() { return standalone; }, onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { listeners.add(listener); },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { listeners.delete(listener); },
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => true,
    } as MediaQueryList;
    Object.assign(window, { pwaTestChangeDisplayMode: (value: boolean) => {
      standalone = value;
      for (const listener of listeners) {
        const event = new Event("change");
        if (typeof listener === "function") listener(event); else listener.handleEvent(event);
      }
    } });
  }, options);
}
