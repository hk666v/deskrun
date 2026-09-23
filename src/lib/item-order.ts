import type { LaunchItem } from "../types";

export type ItemSectionId = "pinned" | "recent" | "unused";

export interface ItemSection {
  id: ItemSectionId;
  title: string;
  items: LaunchItem[];
}

/// Splits a list the way the launcher shows it: what the user pinned, then what
/// they have actually run, then what they have not. Within a section the order
/// is whatever the caller handed in, which is the user's own.
export function groupItems(items: LaunchItem[]): ItemSection[] {
  const pinned = items.filter((item) => item.isFavorite);
  const recent = items.filter(
    (item) => !item.isFavorite && (item.launchCount > 0 || item.lastLaunchedAt !== null),
  );
  const unused = items.filter(
    (item) => !item.isFavorite && item.launchCount === 0 && item.lastLaunchedAt === null,
  );

  return [
    { id: "pinned", title: "Pinned", items: pinned },
    { id: "recent", title: "Recent", items: recent },
    { id: "unused", title: "Unused", items: unused },
  ].filter((section) => section.items.length > 0) as ItemSection[];
}

/// The order the items are actually shown in: the sections, flattened.
///
/// Everything that walks the list — the arrow keys, and the reorder that follows
/// a drop — reads the order from here rather than from the list it was built
/// out of. The two are not the same: a favourite sitting halfway down the
/// unsectioned list is drawn at the top, so a walk over the raw list jumps up
/// and down the screen, and an item dropped between two neighbours lands
/// somewhere else entirely.
export function displayOrder(items: LaunchItem[], sectioned: boolean): LaunchItem[] {
  if (!sectioned) {
    return items;
  }

  return groupItems(items).flatMap((section) => section.items);
}
