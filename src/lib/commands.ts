import { invoke } from "@tauri-apps/api/core";
import type {
  BootstrapData,
  CreateItemPayload,
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
  return invoke<void>("launch_item", { itemId });
}

export function importPaths(paths: string[]) {
  return invoke<LaunchItem[]>("import_paths", { paths });
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

export function setWindowSize(width: number, height: number) {
  return invoke<BootstrapData>("set_window_size", { width, height });
}

export function syncWindowSize(width: number, height: number) {
  return invoke<BootstrapData>("sync_window_size", { width, height });
}
