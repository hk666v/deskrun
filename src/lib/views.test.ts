import { describe, expect, it } from "vitest";
import {
  DISCOVERY_VIEW_ID,
  FAVORITES_VIEW_ID,
  RECENT_VIEW_ID,
  stepView,
  viewIds,
} from "./views";
import type { Group } from "../types";

const groups: Group[] = [
  { id: "g-system", name: "系统", sortOrder: 0 },
  { id: "g-misc", name: "hk-misc", sortOrder: 1 },
];

describe("viewIds", () => {
  it("lists the built-in views, then the groups in their own order", () => {
    expect(viewIds(groups)).toEqual([
      null,
      FAVORITES_VIEW_ID,
      RECENT_VIEW_ID,
      DISCOVERY_VIEW_ID,
      "g-system",
      "g-misc",
    ]);
  });

  it("is the built-in views alone when there are no groups", () => {
    expect(viewIds([])).toHaveLength(4);
  });
});

describe("stepView", () => {
  const ids = viewIds(groups);

  it("walks one tab at a time", () => {
    expect(stepView(ids, FAVORITES_VIEW_ID, 1)).toBe(RECENT_VIEW_ID);
    expect(stepView(ids, RECENT_VIEW_ID, -1)).toBe(FAVORITES_VIEW_ID);
  });

  it("wraps at both ends of the strip", () => {
    expect(stepView(ids, "g-misc", 1)).toBe(null);
    expect(stepView(ids, null, -1)).toBe("g-misc");
  });

  it("starts at the top when the current view is not one of them", () => {
    expect(stepView(ids, "__gone__", 1)).toBe(null);
  });

  it("stands still when there is nothing to walk", () => {
    expect(stepView([], null, 1)).toBe(null);
  });
});
