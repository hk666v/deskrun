import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { LaunchItem } from "../types";

export interface ItemLocation {
  path: string;
  /// Select the file inside its folder, rather than opening the path itself.
  reveal: boolean;
}

/// Where an item lives on disk, or null when it has no location worth showing.
///
/// The answer differs by kind rather than being a straight read of `target`:
/// a command on PATH has no folder of its own, and a folder item *is* the folder
/// the user wants — revealing it would only select it inside its parent, one
/// step further away than they asked to be.
export function itemLocation(item: LaunchItem): ItemLocation | null {
  if (item.kind === "url") {
    return null;
  }

  if (item.kind === "command") {
    const directory = item.workingDir?.trim();
    return directory ? { path: directory, reveal: false } : null;
  }

  const target = item.target.trim();
  if (target.length === 0) {
    return null;
  }

  return { path: target, reveal: item.kind !== "folder" };
}

/// Shows an item's location in the file manager.
export async function revealItemLocation(item: LaunchItem): Promise<void> {
  const location = itemLocation(item);
  if (!location) {
    throw new Error("this item has no location on disk");
  }

  if (location.reveal) {
    await revealItemInDir(location.path);
  } else {
    await openPath(location.path);
  }
}
