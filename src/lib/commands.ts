import { invoke } from "@tauri-apps/api/core";
import type {
  BootstrapData,
  CreateItemPayload,
  DiscoveryCandidate,
  DiscoveryScanOptions,
  Group,
  LaunchItem,
  Settings,
  UpdateItemPayload,
} from "../types";

export function getBootstrapData() {
  return invoke<BootstrapData>("get_bootstrap_data");
}

export function createItem(payload: CreateItemPayload) {
  return invoke<LaunchItem>("create_item", { payload });
}

export function updateItem(payload: UpdateItemPayload) {
  return invoke<LaunchItem>("update_item", { payload });
}

export function deleteItem(itemId: string) {
  return invoke<void>("delete_item", { itemId });
}

export function reorderItems(itemIds: string[]) {
  return invoke<LaunchItem[]>("reorder_items", { itemIds });
}

export function createGroup(name: string, parentId: string | null = null) {
  return invoke<Group>("create_group", { name, parentId });
}

export function renameGroup(groupId: string, name: string) {
  return invoke<Group[]>("rename_group", { groupId, name });
}

export function deleteGroup(groupId: string) {
  return invoke<Group[]>("delete_group", { groupId });
}

/// Puts a group inside another one, or back at the top level, at a chosen place
/// among its new siblings. `beforeId` of null means last.
export function moveGroup(
  groupId: string,
  parentId: string | null,
  beforeId: string | null,
) {
  return invoke<Group[]>("move_group", { groupId, parentId, beforeId });
}

export function launchItem(itemId: string) {
  return invoke<LaunchItem>("launch_item", { itemId });
}

/// Elevates for this one run regardless of the item's own setting, so a UAC
/// prompt appears even for something normally launched unelevated.
export function launchItemAsAdmin(itemId: string) {
  return invoke<LaunchItem>("launch_item_as_admin", { itemId });
}

/// Whether the item's target is no longer on disk. Asked after a launch has
/// failed, to tell "this was uninstalled" from everything else.
export function itemTargetGone(itemId: string) {
  return invoke<boolean>("item_target_gone", { itemId });
}

export function duplicateItem(itemId: string) {
  return invoke<LaunchItem>("duplicate_item", { itemId });
}

export function toggleFavorite(itemId: string, favorite: boolean) {
  return invoke<LaunchItem>("toggle_favorite", { itemId, favorite });
}

export function importPaths(paths: string[]) {
  return invoke<LaunchItem[]>("import_paths", { paths });
}

export function scanDiscoveryCandidates(options: DiscoveryScanOptions) {
  return invoke<DiscoveryCandidate[]>("scan_discovery_candidates", { options });
}

export function importDiscoveryCandidates(candidates: Array<Pick<DiscoveryCandidate, "name" | "kind" | "target">>) {
  return invoke<LaunchItem[]>("import_discovery_candidates", { candidates });
}

export function setHotkey(hotkey: string) {
  return invoke<BootstrapData>("set_hotkey", { hotkey });
}

export function setLaunchOnStartup(enabled: boolean) {
  return invoke<BootstrapData>("set_launch_on_startup", { enabled });
}

export function setCloseOnLaunch(closeOnLaunch: boolean) {
  return invoke<BootstrapData>("set_close_on_launch", { closeOnLaunch });
}

export function setFollowCursorMonitor(follow: boolean) {
  return invoke<BootstrapData>("set_follow_cursor_monitor", { follow });
}

export function setUiScale(scale: number) {
  return invoke<BootstrapData>("set_ui_scale", { scale });
}

export function setSidebarCollapsed(collapsed: boolean) {
  return invoke<BootstrapData>("set_sidebar_collapsed", { collapsed });
}

/// The key that returns the caret to the search field, written as "Ctrl+S".
export function setFocusSearchKey(value: string) {
  return invoke<BootstrapData>("set_focus_search_key", { value });
}

/// The key that shows or hides the group column, written as "Ctrl+O".
export function setToggleSidebarKey(value: string) {
  return invoke<BootstrapData>("set_toggle_sidebar_key", { value });
}

export function setDisplayMode(displayMode: "grid" | "list") {
  return invoke<BootstrapData>("set_display_mode", { displayMode });
}

export function syncWindowSize(width: number, height: number) {
  return invoke<Settings>("sync_window_size", { width, height });
}

export function setConfigDirectory(path: string | null) {
  return invoke<BootstrapData>("set_config_directory", { path });
}

export function exportConfig(destinationDir: string) {
  return invoke<string>("export_config", { destinationDir });
}

export function importConfig(sourceDir: string) {
  return invoke<BootstrapData>("import_config", { sourceDir });
}

export function openConfigDirectory() {
  return invoke<void>("open_config_directory");
}

export function hideMainWindow() {
  return invoke<void>("hide_main_window");
}

export function readIcon(iconPath: string) {
  return invoke<string>("read_icon", { iconPath });
}
