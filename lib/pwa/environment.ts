export type PwaNavigator = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  userAgentData?: { mobile: boolean };
};

export type MobileEnvironment = {
  phone: boolean;
  platform: "ios" | "android" | "other";
  safari: boolean;
};

/** Device identity is independent of viewport size and orientation. */
export function detectMobileDevice(navigator: PwaNavigator): MobileEnvironment {
  const ua = navigator.userAgent;
  const ipad = /iPad/i.test(ua) || (/Mac/i.test(navigator.platform ?? ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const iphone = /iPhone|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const tablet = ipad || /Tablet|PlayBook|Silk/i.test(ua) || (android && !/Mobile/i.test(ua));
  const phone = !tablet && (navigator.userAgentData?.mobile ?? (iphone || (android && /Mobile/i.test(ua)) || /Windows Phone|BlackBerry|BB10.*Mobile|Opera Mini/i.test(ua)));
  return {
    phone,
    platform: iphone || ipad ? "ios" : android ? "android" : "other",
    safari: /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|FBAN|FBAV|Instagram|Line\/|MicroMessenger/i.test(ua),
  };
}

export function isStandaloneDisplayMode(navigator: { standalone?: boolean; userAgent?: string }, standaloneMediaMatches: boolean): boolean {
  return standaloneMediaMatches || navigator.standalone === true;
}

export function requiresMobileInstallation(navigator: PwaNavigator, standaloneMediaMatches: boolean): boolean {
  return detectMobileDevice(navigator).phone && !isStandaloneDisplayMode(navigator, standaloneMediaMatches);
}
