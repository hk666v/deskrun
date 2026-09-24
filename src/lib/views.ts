import type { Group } from "../types";

export const FAVORITES_VIEW_ID = "__favorites__";
export const RECENT_VIEW_ID = "__recent__";
export const DISCOVERY_VIEW_ID = "__discovery__";

/// The built-in views in the order their tabs are drawn. `null` is every item
/// there is, whichever group it belongs to — it is the absence of a group rather
/// than one of its own.
///
/// The strip and the left/right keys both read this: a view that is missing
/// here is one the keyboard cannot reach, which is why the labels live next to
/// the ids rather than being spelled out again where the tabs are rendered.
export const SYSTEM_VIEWS: Array<{ id: string | null; label: string }> = [
  { id: null, label: "All Items" },
  { id: FAVORITES_VIEW_ID, label: "Favorites" },
  { id: RECENT_VIEW_ID, label: "Recent" },
  { id: DISCOVERY_VIEW_ID, label: "Discovery" },
];

/// Every view in the order the tabs are drawn: the built-in ones, then the
/// user's groups in their own order.
export function viewIds(groups: Group[]): Array<string | null> {
  return [...SYSTEM_VIEWS.map((view) => view.id), ...groups.map((group) => group.id)];
}

/// The view `delta` tabs away, wrapping at both ends: a launcher has no room
/// for a key that does nothing at the edge of the strip.
export function stepView(
  ids: Array<string | null>,
  current: string | null,
  delta: number,
): string | null {
  if (ids.length === 0) {
    return current;
  }

  const from = ids.indexOf(current);
  // A view this list does not know about — nothing selected yet — starts from
  // the top rather than refusing to move.
  const index = from < 0 ? 0 : from + delta;
  return ids[(index + ids.length) % ids.length];
}
