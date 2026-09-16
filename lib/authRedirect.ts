export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) return "/";
    const url = new URL(value, "https://kffr.invalid");
    if (url.origin !== "https://kffr.invalid") return "/";
    if (url.pathname === "/login" || url.pathname === "/auth/callback") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function loginPath(next: string): string {
  return `/login?next=${encodeURIComponent(safeNextPath(next))}`;
}

export function signupNextStep(hasSession: boolean, hasUsername: boolean, next: string):
  { kind: "redirect"; path: string } | { kind: "confirm" } {
  if (!hasSession) return { kind: "confirm" };
  return { kind: "redirect", path: hasUsername ? safeNextPath(next) : "/profile" };
}
