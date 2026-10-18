import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Start without movement until the OS preference is known; follow live changes. */
export function useMotionPreference() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduced(value); }).catch(() => { /* Keep the conservative default if unavailable. */ });
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}
