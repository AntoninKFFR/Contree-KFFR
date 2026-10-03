// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameChromeProvider, useGameChrome } from "@/components/GameChromeProvider";

vi.mock("@/components/AppTopNav", () => ({ AppTopNav: ({ variant }: { variant: string }) => <header data-testid="chrome" data-header-variant={variant} /> }));
afterEach(cleanup);
function Game({ active }: { active: boolean }) { useGameChrome(active); return <p>Game</p>; }
const variant = () => screen.getByTestId("chrome").getAttribute("data-header-variant");
describe("explicit game chrome ownership", () => {
  it("activates only for displayed game state and restores default before the next paint", () => {
    const view=render(<StrictMode><GameChromeProvider><Game active={false}/></GameChromeProvider></StrictMode>);
    expect(variant()).toBe("default");
    view.rerender(<StrictMode><GameChromeProvider><Game active/></GameChromeProvider></StrictMode>);
    expect(variant()).toBe("compact-game");
    view.rerender(<StrictMode><GameChromeProvider><p>Home</p></GameChromeProvider></StrictMode>);
    expect(variant()).toBe("default");
  });
  it("keeps a second mounted game registration when the first is removed", () => {
    const view=render(<GameChromeProvider><Game key="first" active/><Game key="second" active/></GameChromeProvider>);
    view.rerender(<GameChromeProvider><Game key="second" active/></GameChromeProvider>);
    expect(variant()).toBe("compact-game");
    view.rerender(<GameChromeProvider><Game key="second" active={false}/></GameChromeProvider>);
    expect(variant()).toBe("default");
  });
});
