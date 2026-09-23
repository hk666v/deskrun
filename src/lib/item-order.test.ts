import { describe, expect, it } from "vitest";
import { displayOrder, groupItems } from "./item-order";
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

const names = (items: LaunchItem[]) => items.map((entry) => entry.name);

describe("groupItems", () => {
  it("puts pinned first, then what has been run, then what has not", () => {
    const items = [
      item("never-run"),
      item("pinned", { isFavorite: true }),
      item("run", { launchCount: 3 }),
      item("run once", { lastLaunchedAt: "2026-01-02T00:00:00Z" }),
    ];

    expect(groupItems(items).map((section) => [section.id, names(section.items)])).toEqual([
      ["pinned", ["pinned"]],
      ["recent", ["run", "run once"]],
      ["unused", ["never-run"]],
    ]);
  });

  it("drops the sections that would be empty", () => {
    expect(groupItems([item("pinned", { isFavorite: true })]).map((s) => s.id)).toEqual([
      "pinned",
    ]);
  });

  it("keeps the caller's order inside a section", () => {
    const items = [
      item("second", { isFavorite: true, sortOrder: 1 }),
      item("first", { isFavorite: true, sortOrder: 0 }),
    ];

    expect(names(groupItems(items)[0].items)).toEqual(["second", "first"]);
  });
});

describe("displayOrder", () => {
  it("hands the list back untouched when it is not sectioned", () => {
    const items = [item("a"), item("b")];
    expect(displayOrder(items, false)).toBe(items);
  });

  it("walks the order the sections are drawn in, not the order handed in", () => {
    // The case that made the arrow keys jump: a favourite sitting fourth in the
    // list is drawn first, so a walk over the raw list skipped past it and then
    // came back to it from the other end.
    const items = [
      item("a", { launchCount: 2 }),
      item("b", { launchCount: 1 }),
      item("c", { launchCount: 1 }),
      item("pinned", { isFavorite: true }),
      item("d", { launchCount: 1 }),
    ];

    expect(names(displayOrder(items, true))).toEqual(["pinned", "a", "b", "c", "d"]);
  });

  it("leaves out nothing", () => {
    const items = [
      item("a", { launchCount: 1 }),
      item("pinned", { isFavorite: true }),
      item("fresh"),
    ];

    expect(displayOrder(items, true)).toHaveLength(items.length);
  });
});
