export type LaunchItemKind = "exe" | "link" | "folder" | "url";
export type IconSource = "auto" | "custom";

export interface LaunchItem {
  id: string;
  name: string;
  kind: LaunchItemKind;
  target: string;
  groupId: string | null;
  iconSource: IconSource;
  iconPath: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Settings {
  hotkey: string;
  launchOnStartup: boolean;
  closeOnLaunch: boolean;
  themeMode: "system";
  windowWidth: number;
  windowHeight: number;
}

export interface WindowSizeLimits {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

export interface BootstrapData {
  items: LaunchItem[];
  groups: Group[];
  settings: Settings;
  windowSizeLimits: WindowSizeLimits;
}

export interface CreateItemPayload {
  kind: LaunchItemKind;
  target: string;
  name?: string;
  groupId?: string | null;
}

export interface UpdateItemPayload {
  id: string;
  name?: string;
  target?: string;
  groupId?: string | null;
  customIconPath?: string;
  clearCustomIcon?: boolean;
}
