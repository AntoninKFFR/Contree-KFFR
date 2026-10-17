import { cloneElement, createContext, useContext, type ReactElement } from "react";
export const RouteContext = createContext<(route: string) => void>(() => {});
export function Link({ children, href, ...props }: { children: ReactElement<{ onPress?: () => void }>; href: string; asChild?: boolean; replace?: boolean }) {
  const go = useContext(RouteContext);
  return cloneElement(children, { ...props, onPress: () => go(href) });
}
