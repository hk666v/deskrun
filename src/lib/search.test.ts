import { describe, expect, it } from "vitest";
import { rankSearchResults, searchBand } from "./search";
import type { LaunchItem } from "../types";

function item(name: string, overrides: Partial<LaunchItem> = {}): LaunchItem {
  return {
    id: name,
    name,
    kind: "exe",
    target: `C:\\tools\\${name}.exe`,
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

const names = (entries: Array<{ item: LaunchItem }>) => entries.map((entry) => entry.item.name);

describe("searchBand", () => {
  it("puts what is pinned before what has been run, and both before the rest", () => {
    expect(searchBand(item("pinned", { isFavorite: true }))).toBe(0);
    expect(searchBand(item("run", { launchCount: 2 }))).toBe(1);
    expect(searchBand(item("run once", { lastLaunchedAt: "2026-01-02T00:00:00Z" }))).toBe(1);
    expect(searchBand(item("never"))).toBe(2);
  });
});

describe("rankSearchResults", () => {
  it("leads with the pinned and recently used matches, whatever their score", () => {
    const ranked = rankSearchResults([
      { item: item("plain"), score: 1600 },
      { item: item("used", { launchCount: 4 }), score: 900 },
      { item: item("pinned", { isFavorite: true }), score: 400 },
    ]);

    expect(names(ranked)).toEqual(["pinned", "used", "plain"]);
  });

  it("orders by match score inside a band", () => {
    const ranked = rankSearchResults([
      { item: item("weaker"), score: 300 },
      { item: item("stronger"), score: 1500 },
    ]);

    expect(names(ranked)).toEqual(["stronger", "weaker"]);
  });

  it("hands each item back once, however many ways it matched", () => {
    const shared = item("pinned and used", { isFavorite: true, launchCount: 9 });
    const ranked = rankSearchResults([
      { item: shared, score: 100 },
      { item: shared, score: 1200 },
      { item: item("other"), score: 800 },
    ]);

    expect(names(ranked)).toEqual(["pinned and used", "other"]);
    expect(new Set(ranked.map((entry) => entry.item.id)).size).toBe(ranked.length);
  });
});
