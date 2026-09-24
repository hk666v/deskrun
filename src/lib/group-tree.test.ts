import { describe, expect, it } from "vitest";
import { childrenOf, descendantIds, flattenGroups, subtreeIds } from "./group-tree";
import type { Group } from "../types";

function group(id: string, parentId: string | null = null, sortOrder = 0): Group {
  return { id, name: id, sortOrder, parentId };
}

// a ── a1 ── a1x
//    └─ a2
// b
const tree: Group[] = [
  group("b", null, 1),
  group("a", null, 0),
  group("a2", "a", 1),
  group("a1x", "a1", 0),
  group("a1", "a", 0),
];

const ids = (groups: Group[]) => groups.map((entry) => entry.id);

describe("childrenOf", () => {
  it("hands back one level, in its own order", () => {
    expect(ids(childrenOf(tree, null))).toEqual(["a", "b"]);
    expect(ids(childrenOf(tree, "a"))).toEqual(["a1", "a2"]);
  });

  it("has nothing for a group with nothing inside it", () => {
    expect(childrenOf(tree, "b")).toEqual([]);
  });
});

describe("descendantIds", () => {
  it("walks every depth", () => {
    expect(descendantIds(tree, "a")).toEqual(["a1", "a1x", "a2"]);
  });

  it("is empty for a leaf", () => {
    expect(descendantIds(tree, "a2")).toEqual([]);
  });

  it("stops rather than looping when the data points at itself", () => {
    const looped: Group[] = [group("x", "y"), group("y", "x")];
    expect(descendantIds(looped, "x").sort()).toEqual(["y"]);
  });
});

describe("subtreeIds", () => {
  it("is the group and everything under it", () => {
    expect(subtreeIds(tree, "a")).toEqual(["a", "a1", "a1x", "a2"]);
  });
});

describe("flattenGroups", () => {
  const expanded = () => true;

  it("lists a branch under its parent, with the depth to indent by", () => {
    expect(
      flattenGroups(tree, expanded).map((row) => [row.group.id, row.depth]),
    ).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a1x", 2],
      ["a2", 1],
      ["b", 0],
    ]);
  });

  it("leaves out what is inside a collapsed group", () => {
    const rows = flattenGroups(tree, (id) => id !== "a");
    expect(ids(rows.map((row) => row.group))).toEqual(["a", "b"]);
  });

  it("shows a group that is its own ancestor exactly once", () => {
    const looped: Group[] = [group("x", "x")];
    expect(ids(flattenGroups(looped, expanded).map((row) => row.group))).toEqual([]);
  });
});
