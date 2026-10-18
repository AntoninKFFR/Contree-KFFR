import { cloneElement, createContext, useContext, useEffect, type ReactElement, type EffectCallback } from "react";
export const RouteContext = createContext<(route: string) => void>(() => {});
export function useRouter() { const go = useContext(RouteContext); return { push: go }; }
export function useFocusEffect(effect: EffectCallback) { useEffect(effect, [effect]); }
export function Link({ children, href, ...props }: { children: ReactElement<{ onPress?: () => void }>; href: string; asChild?: boolean; replace?: boolean }) {
  const go = useContext(RouteContext);
  return cloneElement(children, { ...props, onPress: () => go(href) });
}
