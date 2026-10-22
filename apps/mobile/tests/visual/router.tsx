import { cloneElement, createContext, useContext, useEffect, type ReactElement, type EffectCallback } from "react";
export type VisualHref = string | { pathname: string; params?: Record<string, unknown> };
export const RouteContext = createContext<(route: VisualHref) => void>(() => {});
export const SearchParamsContext = createContext<Record<string, string>>({});
export function useLocalSearchParams<T>() { return useContext(SearchParamsContext) as T; }
export function useRouter() { const go = useContext(RouteContext); return { push: go, replace: go }; }
export function useFocusEffect(effect: EffectCallback) { useEffect(effect, [effect]); }
export function Link({ children, href, ...props }: { children: ReactElement<{ onPress?: () => void }>; href: string; asChild?: boolean; replace?: boolean }) {
  const go = useContext(RouteContext);
  return cloneElement(children, { ...props, onPress: () => go(href) });
}
