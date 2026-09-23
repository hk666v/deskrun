import { describe, expect, it } from "vitest";
import { itemLocation } from "./location";
import type { LaunchItem, LaunchItemKind } from "../types";

function item(kind: LaunchItemKind, overrides: Partial<LaunchItem> = {}): LaunchItem {
  return {
    id: "id",
    name: "name",
    kind,
    target: "C:\\Tools\\app.exe",
    command: null,
    note: null,
    fixedArgs: null,
    runtimeArgs: null,
    workingDir: null,
    keepOpen: false,
    runAsAdmin: false,
    isFavorite: false,
    launchCount: 0,
    lastLaunchedAt: null,
    groupId: null,
    iconSource: "auto",
    iconPath: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("itemLocation", () => {
  it("selects an executable inside its folder", () => {
    expect(itemLocation(item("exe"))).toEqual({
      path: "C:\\Tools\\app.exe",
      reveal: true,
    });
  });

  it("selects a shortcut inside its folder", () => {
    expect(itemLocation(item("link"))?.reveal).toBe(true);
  });

  /// Revealing a folder would select it inside its parent — one step further
  /// away than the user asked to be.
  it("opens a folder item rather than revealing it", () => {
    expect(itemLocation(item("folder", { target: "D:\\hk-tools" }))).toEqual({
      path: "D:\\hk-tools",
      reveal: false,
    });
  });

  it("has nothing to show for a URL", () => {
    expect(itemLocation(item("url", { target: "https://example.com" }))).toBeNull();
  });

  /// A command on PATH has no folder of its own, so the working directory is the
  /// only place it can point at.
  it("falls back to the working directory of a command", () => {
    expect(
      itemLocation(item("command", { target: "httpx", workingDir: "C:\\work" })),
    ).toEqual({ path: "C:\\work", reveal: false });
  });

  it("has nothing to show for a command with no working directory", () => {
    expect(itemLocation(item("command", { target: "httpx" }))).toBeNull();
    expect(
      itemLocation(item("command", { target: "httpx", workingDir: "   " })),
    ).toBeNull();
  });

  it("has nothing to show for an empty target", () => {
    expect(itemLocation(item("exe", { target: "  " }))).toBeNull();
  });

  it("trims the path it hands to the shell", () => {
    expect(itemLocation(item("exe", { target: "  C:\\Tools\\app.exe  " }))?.path).toBe(
      "C:\\Tools\\app.exe",
    );
  });
});
