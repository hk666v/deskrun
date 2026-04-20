import { invoke } from "@tauri-apps/api/core";
import type {
  BootstrapData,
  CreateItemPayload,
  DiscoveryCandidate,
  DiscoveryScanOptions,
  Group,
  LaunchItem,
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

export function createGroup(name: string) {
  return invoke<Group>("create_group", { name });
}

export function renameGroup(groupId: string, name: string) {
  return invoke<Group[]>("rename_group", { groupId, name });
}

export function deleteGroup(groupId: string) {
  return invoke<Group[]>("delete_group", { groupId });
}

export function reorderGroups(groupIds: string[]) {
  return invoke<Group[]>("reorder_groups", { groupIds });
}

export function launchItem(itemId: string) {
  return invoke<LaunchItem>("launch_item", { itemId });
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

export function setDisplayMode(displayMode: "grid" | "list") {
  return invoke<BootstrapData>("set_display_mode", { displayMode });
}

export function setWindowSize(width: number, height: number) {
  return invoke<BootstrapData>("set_window_size", { width, height });
}

export function syncWindowSize(width: number, height: number) {
  return invoke<BootstrapData>("sync_window_size", { width, height });
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
