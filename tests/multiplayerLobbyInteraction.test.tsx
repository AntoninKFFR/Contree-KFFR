// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyRoomCode, LobbyHeader } from "@/components/multiplayer/RoomLobby";
import type { RoomPlayerView } from "@/lib/roomTypes";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const player: RoomPlayerView = { seat_index: 0, kind: "human", display_name: "Joueur", is_ready: false,
  is_connected: true, bot_takeover: false, is_host: true, is_ranked: false, rating: null, rank: null };
const props = () => ({ canInviteFriends: true, canStartGame: false, canTransferHost: false, code: "LOBBY125", currentSeat: player,
  isHost: true, isStartingGame: false, isUpdatingReady: false, scoringMode: "ffb" as const, status: "lobby" as const, targetScore: 1000,
  onInviteFriends: vi.fn(), onOpenPreferences: vi.fn(), onOpenRules: vi.fn(), onReady: vi.fn(), onRefresh: vi.fn(), onStartGame: vi.fn(), onTransferHost: vi.fn() });

describe("lobby local interactions", () => {
  it("copies once while pending, announces success and keeps focus", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<LobbyHeader {...props()} />);
    const copy = screen.getByRole("button", { name: "Copier le code" }); copy.focus();
    fireEvent.click(copy); fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledExactlyOnceWith("LOBBY125");
    resolve(); await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Code copié"));
    expect(document.activeElement).toBe(copy);
  });
  for (const denied of [false, true]) it(`uses DOM fallback when clipboard ${denied ? "rejects" : "is absent"}, removing its temporary field`, async () => {
    vi.stubGlobal("navigator", denied ? { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } } : {});
    const exec = vi.fn(() => { expect((document.activeElement as HTMLTextAreaElement).value).toBe("LOBBY125"); return true; });
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    const button = document.createElement("button"); document.body.append(button); button.focus();
    expect(await copyRoomCode("LOBBY125")).toBe(true);
    expect(exec).toHaveBeenCalledExactlyOnceWith("copy"); expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button); button.remove();
  });
  it("reports inability without a false success when both methods fail", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    Object.defineProperty(document, "execCommand", { value: vi.fn(() => false), configurable: true });
    render(<LobbyHeader {...props()} />); fireEvent.click(screen.getByRole("button", { name: "Copier le code" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copie indisponible"));
    expect(document.querySelector("textarea")).toBeNull();
  });
  it("uses a portal dialog, keeps disabled transfer, closes on Escape and restores its trigger", () => {
    render(<div style={{ overflow: "hidden" }}><LobbyHeader {...props()} /></div>);
    const trigger = screen.getByRole("button", { name: "Plus d’actions pour la table" }); trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Actions de la table" });
    expect(dialog.parentElement).toBe(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect((within(dialog).getByRole("button", { name: "Transférer l'hôte" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("prioritizes readiness before start, and preserves all native pending guards", () => {
    const callbacks = props(); const { rerender } = render(<LobbyHeader {...callbacks} />);
    expect(screen.getByRole("button", { name: "Prêt" }).className).toContain("coinche-primary-action");
    expect((screen.getByRole("button", { name: "Lancer la partie" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<LobbyHeader {...callbacks} currentSeat={{ ...player, is_ready: true }} canStartGame isStartingGame isUpdatingReady />);
    expect(screen.getByRole("button", { name: "Lancer la partie" }).className).toContain("coinche-primary-action");
    expect(screen.getByRole("button", { name: "Pas prêt" }).className).toContain("coinche-secondary-action");
    fireEvent.click(screen.getByRole("button", { name: "Pas prêt" })); fireEvent.click(screen.getByRole("button", { name: "Lancer la partie" }));
    expect(callbacks.onReady).not.toHaveBeenCalled(); expect(callbacks.onStartGame).not.toHaveBeenCalled();
  });
});
