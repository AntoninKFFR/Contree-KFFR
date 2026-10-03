"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { AppTopNav } from "@/components/AppTopNav";

const GameChromeContext = createContext<(() => () => void) | null>(null);

/** The displayed game owns its registration, independently of routes/orientation. */
export function GameChromeProvider({ children }: { children: ReactNode }) {
  const [games, setGames] = useState(0);
  const register = useCallback(() => {
    setGames(count => count + 1);
    return () => setGames(count => count - 1);
  }, []);
  const variant = games > 0 ? "compact-game" : "default";
  return <GameChromeContext.Provider value={register}>
    <div className="coinche-viewport-dynamic coinche-app-chrome" data-game-chrome={variant}>
      <AppTopNav variant={variant} />
      {children}
    </div>
  </GameChromeContext.Provider>;
}

export function useGameChrome(active: boolean) {
  const register = useContext(GameChromeContext);
  useLayoutEffect(() => {
    if (active && register) return register();
  }, [active, register]);
}
