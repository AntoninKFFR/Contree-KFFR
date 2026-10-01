// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { lockBodyScroll } from "@/lib/ui/bodyScrollLock";

describe("temporary menu and dialog scroll ownership", () => {
  it.each([0, 1])("keeps the document locked until both overlapping surfaces close (order %i)", (first) => {
    const body = document.createElement("body");
    const releases = [lockBodyScroll(body), lockBodyScroll(body)];
    releases[first]();
    expect(body.style.overflow).toBe("hidden");
    releases[1 - first]();
    expect(body.style.overflow).toBe("");
  });
  it.each(["clip", "hidden"])("restores a pre-existing %s setting after the last surface closes", (overflow) => {
    const body = document.createElement("body");
    body.style.overflow = overflow;
    lockBodyScroll(body)();
    expect(body.style.overflow).toBe(overflow);
  });
  it("makes cleanup idempotent across a later surface lifetime", () => {
    const body = document.createElement("body");
    const closeMenu = lockBodyScroll(body);
    closeMenu();
    const closeDialog = lockBodyScroll(body);
    closeMenu();
    expect(body.style.overflow).toBe("hidden");
    closeDialog();
    expect(body.style.overflow).toBe("");
  });
});
