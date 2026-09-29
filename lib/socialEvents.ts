export const SOCIAL_CHANGED_EVENT = "kffr:social-changed";

export function notifySocialChanged() {
  window.dispatchEvent(new Event(SOCIAL_CHANGED_EVENT));
}
