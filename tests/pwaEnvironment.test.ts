import { describe, expect, it } from "vitest";
import { detectMobileDevice, isStandaloneDisplayMode, requiresMobileInstallation, type PwaNavigator } from "@/lib/pwa/environment";

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
describe("PWA environment identity", () => {
  it.each([
    ["iPhone portrait", { userAgent: iphone }, true],
    ["iPhone landscape 932×430 (same identity)", { userAgent: iphone }, true],
    ["Android phone", { userAgent: android }, true],
    ["UA client hints phone", { userAgent: "unknown", userAgentData: { mobile: true } }, true],
    ["UA client hints desktop override", { userAgent: android, userAgentData: { mobile: false } }, false],
    ["desktop Chrome", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36" }, false],
    ["desktop Safari", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/18.0 Safari/605.1.15" }, false],
    ["desktop Firefox", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/130.0" }, false],
    ["iPad Safari", { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1" }, false],
    ["iPadOS Mac identity", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 }, false],
    ["Android tablet", { userAgent: "Mozilla/5.0 (Linux; Android 14; Tablet) Chrome/130.0 Safari/537.36", userAgentData: { mobile: true } }, false],
    ["Android tablet without Tablet word", { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-X610) Chrome/130.0 Safari/537.36" }, false],
    ["Windows touch laptop", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", platform: "Win32", maxTouchPoints: 10 }, false],
  ] as const)("%s", (_name, nav, phone) => {
    expect(detectMobileDevice(nav).phone).toBe(phone);
    expect(requiresMobileInstallation(nav, false)).toBe(phone);
    expect(requiresMobileInstallation(nav, true)).toBe(false);
  });
  it.each([iphone, android])("standalone signals both allow a phone: %s", (userAgent) => {
    const nav: PwaNavigator = { userAgent, standalone: true };
    expect(requiresMobileInstallation(nav, false)).toBe(false);
    expect(isStandaloneDisplayMode(nav, false)).toBe(true);
    expect(isStandaloneDisplayMode({ standalone: false }, true)).toBe(true);
    expect(isStandaloneDisplayMode({}, false)).toBe(false);
  });
  it.each(["CriOS/130.0", "FxiOS/130.0", "EdgiOS/130.0", "Instagram", "FBAN/FBIOS", "GSA/130.0"])("iOS alternative browser: %s", (browser) => {
    expect(detectMobileDevice({ userAgent: `${iphone} ${browser}` })).toMatchObject({ phone: true, platform: "ios", safari: false });
  });
  it("recognizes Safari without inferring a phone from touch", () => {
    expect(detectMobileDevice({ userAgent: iphone })).toMatchObject({ phone: true, platform: "ios", safari: true });
  });
});
