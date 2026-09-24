export type LaunchItemKind = "exe" | "link" | "folder" | "url" | "command";
export type IconSource = "auto" | "custom";

export interface LaunchItem {
  id: string;
  name: string;
  kind: LaunchItemKind;
  target: string;
  command: string | null;
  note: string | null;
  fixedArgs: string | null;
  runtimeArgs: string | null;
  workingDir: string | null;
  keepOpen: boolean;
  /** Launch through the shell's `runas` verb so Windows prompts for elevation. */
  runAsAdmin: boolean;
  isFavorite: boolean;
  launchCount: number;
  lastLaunchedAt: string | null;
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
  /** The group this one sits inside, or null for the top level. */
  parentId?: string | null;
}

export interface Settings {
  hotkey: string;
  launchOnStartup: boolean;
  closeOnLaunch: boolean;
  themeMode: "system";
  displayMode: "grid" | "list";
  windowWidth: number;
  windowHeight: number;
  windowX?: number | null;
  windowY?: number | null;
  /** Open on the monitor under the pointer, centred, rather than reusing the saved position. */
  followCursorMonitor: boolean;
  /** Interface scale, applied as a webview zoom. 1 is the designed size. */
  uiScale: number;
  /** Whether the group sidebar is out of the way. */
  sidebarCollapsed: boolean;
  /** The key that returns the caret to the search field, as "Ctrl+S". */
  focusSearchKey: string;
  /** The key that shows or hides the group column, as "Ctrl+O". */
  toggleSidebarKey: string;
}

export interface ConfigDirectoryInfo {
  currentPath: string;
  defaultPath: string;
  usingCustomPath: boolean;
}

export interface DiscoveryScanOptions {
  startMenu: boolean;
  desktop: boolean;
  registry: boolean;
}

export interface DiscoveryCandidate {
  id: string;
  name: string;
  kind: "exe" | "link";
  target: string;
  source: "start_menu" | "desktop" | "registry";
  confidence: "high" | "medium" | "low";
  alreadyExists: boolean;
}

export interface BootstrapData {
  items: LaunchItem[];
  groups: Group[];
  settings: Settings;
  configDirectory: ConfigDirectoryInfo;
  /** A non-fatal startup problem to surface, such as the hotkey being taken. */
  startupWarning: string | null;
}

export interface CreateItemPayload {
  kind: LaunchItemKind;
  target: string;
  name?: string;
  command?: string;
  note?: string | null;
  fixedArgs?: string | null;
  runtimeArgs?: string | null;
  workingDir?: string | null;
  keepOpen?: boolean;
  runAsAdmin?: boolean;
  groupId?: string | null;
}

export interface UpdateItemPayload {
  id: string;
  name?: string;
  target?: string;
  command?: string;
  note?: string | null;
  fixedArgs?: string | null;
  runtimeArgs?: string | null;
  workingDir?: string | null;
  keepOpen?: boolean;
  runAsAdmin?: boolean;
  groupId?: string | null;
  customIconPath?: string;
  clearCustomIcon?: boolean;
}
