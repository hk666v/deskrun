import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  createGroup,
  createItem,
  deleteGroup,
  deleteItem,
  getBootstrapData,
  importPaths,
  launchItem,
  openConfigDirectory,
  renameGroup,
  reorderItems,
  setConfigDirectory,
  setCloseOnLaunch,
  setHotkey,
  setLaunchOnStartup,
  syncWindowSize,
  setWindowSize,
  updateItem,
} from "./lib/commands";
import { GroupTabs } from "./components/GroupTabs";
import { ItemEditorDialog } from "./components/ItemEditorDialog";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { ItemGrid } from "./components/ItemGrid";
import { LauncherShell } from "./components/LauncherShell";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { copyText } from "./lib/clipboard";
import { buildCommandPreview } from "./lib/command-preview";
import { buildSearchIndexEntry, matchesSearch } from "./lib/search";
import type {
  ConfigDirectoryInfo,
  Group,
  LaunchItem,
  Settings,
  WindowSizeLimits,
} from "./types";

type EditorState =
  | { mode: "create-url"; item: null }
  | { mode: "create-command"; item: null }
  | { mode: "edit"; item: LaunchItem }
  | null;

type ContextMenuState = {
  item: LaunchItem;
  x: number;
  y: number;
} | null;

type HoverPreviewState = {
  item: LaunchItem;
  x: number;
  y: number;
} | null;

const DEFAULT_SETTINGS: Settings = {
  hotkey: "Alt+Space",
  launchOnStartup: false,
  closeOnLaunch: true,
  themeMode: "system",
  windowWidth: 760,
  windowHeight: 560,
};

const DEFAULT_WINDOW_SIZE_LIMITS: WindowSizeLimits = {
  minWidth: 760,
  minHeight: 560,
  maxWidth: 1400,
  maxHeight: 960,
};

const DEFAULT_CONFIG_DIRECTORY: ConfigDirectoryInfo = {
  currentPath: "",
  defaultPath: "",
  usingCustomPath: false,
};

function App() {
  const currentWindow = getCurrentWindow();
  const [items, setItems] = createSignal<LaunchItem[]>([]);
  const [groups, setGroups] = createSignal<Group[]>([]);
  const [settings, setSettings] = createSignal<Settings>(DEFAULT_SETTINGS);
  const [configDirectory, setConfigDirectoryInfo] =
    createSignal<ConfigDirectoryInfo>(DEFAULT_CONFIG_DIRECTORY);
  const [windowSizeLimits, setWindowSizeLimits] = createSignal<WindowSizeLimits>(
    DEFAULT_WINDOW_SIZE_LIMITS,
  );
  const [query, setQuery] = createSignal("");
  const [currentGroupId, setCurrentGroupId] = createSignal<string | null>(null);
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null);
  const [editorState, setEditorState] = createSignal<EditorState>(null);
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState>(null);
  const [hoverPreview, setHoverPreview] = createSignal<HoverPreviewState>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [dialogBusy, setDialogBusy] = createSignal(false);
  const [draggingExternal, setDraggingExternal] = createSignal(false);
  const [feedback, setFeedback] = createSignal("");
  let hoverPreviewTimer: number | undefined;
  let pendingHoverPreview: HoverPreviewState = null;
  let searchInput!: HTMLInputElement;

  const searchIndex = createMemo(() =>
    items().map((item) => ({
      item,
      search: buildSearchIndexEntry(item),
    })),
  );

  const visibleItems = createMemo(() => {
    const term = query().trim();
    return searchIndex()
      .filter(({ item }) =>
        currentGroupId() ? item.groupId === currentGroupId() : true,
      )
      .filter(({ search }) => matchesSearch(search, term))
      .map(({ item }) => item)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  });

  const syncSelection = (nextItems: LaunchItem[]) => {
    if (nextItems.length === 0) {
      setSelectedItemId(null);
      return;
    }

    if (!nextItems.some((item) => item.id === selectedItemId())) {
      setSelectedItemId(nextItems[0].id);
    }
  };

  const refresh = async () => {
    const data = await getBootstrapData();
    setItems(data.items);
    setGroups(data.groups);
    setSettings(data.settings);
    setConfigDirectoryInfo(data.configDirectory);
    setWindowSizeLimits(data.windowSizeLimits);
    syncSelection(data.items);
  };

  const hoverPreviewPosition = createMemo(() => {
    const state = hoverPreview();
    if (!state) {
      return null;
    }

    const panelWidth = 360;
    const panelHeight = 240;
    const gap = 18;
    const margin = 16;
    const canPlaceRight = state.x + gap + panelWidth <= window.innerWidth - margin;
    const left = canPlaceRight
      ? state.x + gap
      : Math.max(margin, state.x - gap - panelWidth);
    const maxY = Math.max(margin, window.innerHeight - panelHeight - margin);
    const top = Math.min(Math.max(state.y - 18, margin), maxY);
    const arrowTop = Math.min(Math.max(state.y - top - 10, 18), panelHeight - 28);

    return {
      left,
      top,
      side: canPlaceRight ? "right" : "left",
      arrowTop,
    };
  });

  const hoverPreviewDisplay = createMemo(() => {
    const state = hoverPreview();
    const position = hoverPreviewPosition();
    if (!state || !position) {
      return null;
    }

    return {
      item: state.item,
      ...position,
    };
  });

  const notify = (message: string) => {
    setFeedback(message);
    window.clearTimeout((notify as unknown as { timer?: number }).timer);
    (notify as unknown as { timer?: number }).timer = window.setTimeout(() => {
      setFeedback("");
    }, 2200);
  };

  const importSelectedPaths = async (paths: string[]) => {
    const created = await importPaths(paths);
    if (created.length === 0) {
      notify("No supported items were imported");
      return;
    }

    setItems((current) => [...current, ...created]);
    syncSelection(visibleItems());
    notify(`Imported ${created.length} launcher item(s)`);
  };

  const handlePickApp = async () => {
    setDialogBusy(true);
    try {
      const result = await open({
        multiple: true,
        filters: [{ name: "Apps", extensions: ["exe", "lnk"] }],
      });

      if (Array.isArray(result)) {
        await importSelectedPaths(result);
      } else if (typeof result === "string") {
        await importSelectedPaths([result]);
      }
    } finally {
      setDialogBusy(false);
    }
  };

  const handlePickFolder = async () => {
    setDialogBusy(true);
    try {
      const result = await open({
        directory: true,
        multiple: true,
      });

      if (Array.isArray(result)) {
        await importSelectedPaths(result);
      } else if (typeof result === "string") {
        await importSelectedPaths([result]);
      }
    } finally {
      setDialogBusy(false);
    }
  };

  const performLaunch = async (item: LaunchItem) => {
    setContextMenu(null);
    setHoverPreview(null);
    await launchItem(item.id);
  };

  const clearHoverPreview = () => {
    window.clearTimeout(hoverPreviewTimer);
    hoverPreviewTimer = undefined;
    pendingHoverPreview = null;
    setHoverPreview(null);
  };

  const scheduleHoverPreview = (item: LaunchItem, x: number, y: number) => {
    const visible = hoverPreview();
    if (visible?.item.id === item.id) {
      setHoverPreview({ item, x, y });
      return;
    }

    pendingHoverPreview = { item, x, y };
    if (hoverPreviewTimer !== undefined) {
      return;
    }

    hoverPreviewTimer = window.setTimeout(() => {
      hoverPreviewTimer = undefined;
      if (pendingHoverPreview) {
        setHoverPreview(pendingHoverPreview);
      }
    }, 180);
  };

  const handleLaunch = async (item: LaunchItem) => {
    setContextMenu(null);
    await performLaunch(item);
  };

  const handleDelete = async (item: LaunchItem) => {
    setContextMenu(null);
    clearHoverPreview();
    await deleteItem(item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    notify("Launcher item removed");
  };

  const handleCopyCommand = async (item: LaunchItem) => {
    setContextMenu(null);
    clearHoverPreview();
    if (item.kind !== "command") {
      return;
    }

    await copyText(buildCommandPreview(item));
    notify("Command copied");
  };

  const handleReorder = async (fromId: string, toId: string) => {
    const scoped = visibleItems();
    const fromIndex = scoped.findIndex((item) => item.id === fromId);
    const toIndex = scoped.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const nextIds = scoped.map((item) => item.id);
    const [moved] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, moved);
    const updatedItems = await reorderItems(nextIds);
    setItems(updatedItems);
  };

  const moveSelection = (delta: number) => {
    const collection = visibleItems();
    if (collection.length === 0) {
      return;
    }

    const currentIndex = collection.findIndex(
      (item) => item.id === selectedItemId(),
    );
    const safeIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = Math.min(
      collection.length - 1,
      Math.max(0, safeIndex + delta),
    );

    setSelectedItemId(collection[nextIndex].id);
  };

  const hideLauncher = async () => {
    setEditorState(null);
    setSettingsOpen(false);
    setContextMenu(null);
    clearHoverPreview();
    await currentWindow.hide();
  };

  onMount(async () => {
    await refresh();
    let resizeSyncTimer: number | undefined;
    let syncingResize = false;

    const unlistenFocus = await currentWindow.onFocusChanged(async ({ payload }) => {
      if (!payload && !dialogBusy()) {
        await currentWindow.hide();
      }
    });

    const unlistenDragDrop = await currentWindow.onDragDropEvent(async (event) => {
      if (event.payload.type === "over") {
        setDraggingExternal(true);
      } else if (event.payload.type === "drop") {
        setDraggingExternal(false);
        await importSelectedPaths(event.payload.paths);
      } else {
        setDraggingExternal(false);
      }
    });

    const unlistenFocusSearch = await listen("deskrun://focus-search", () => {
      searchInput?.focus();
      searchInput?.select();
    });

    const unlistenResized = await currentWindow.onResized(async () => {
      if (syncingResize) {
        return;
      }

      window.clearTimeout(resizeSyncTimer);
      resizeSyncTimer = window.setTimeout(async () => {
        syncingResize = true;
        try {
          const [size, scaleFactor] = await Promise.all([
            currentWindow.innerSize(),
            currentWindow.scaleFactor(),
          ]);
          const width = Math.round(size.width / scaleFactor);
          const height = Math.round(size.height / scaleFactor);
          const data = await syncWindowSize(width, height);
          setSettings(data.settings);
          setWindowSizeLimits(data.windowSizeLimits);
        } finally {
          window.setTimeout(() => {
            syncingResize = false;
          }, 0);
        }
      }, 140);
    });

    const handleEscape = async (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.code === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        await hideLauncher();
      }
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.code === "Escape") {
        await handleEscape(event);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(4);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-4);
      } else if (event.key === "Enter") {
        const item = visibleItems().find((entry) => entry.id === selectedItemId());
        if (item) {
          event.preventDefault();
          await handleLaunch(item);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleEscape, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleEscape, true);
    document.body?.addEventListener("keydown", handleKeyDown, true);
    document.body?.addEventListener("keyup", handleEscape, true);

    onCleanup(() => {
      clearHoverPreview();
      unlistenFocus();
      unlistenDragDrop();
      unlistenFocusSearch();
      unlistenResized();
      window.clearTimeout(resizeSyncTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleEscape, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keyup", handleEscape, true);
      document.body?.removeEventListener("keydown", handleKeyDown, true);
      document.body?.removeEventListener("keyup", handleEscape, true);
    });
  });

  createEffect(() => {
    syncSelection(visibleItems());
  });

  return (
    <LauncherShell dragging={draggingExternal()}>
      <div class="flex h-full flex-col gap-4">
        <div
          class="flex items-center justify-between gap-4 rounded-[24px] px-1 py-1 select-none"
        >
          <div>
            <p class="text-[11px] uppercase tracking-[0.28em] text-white/36">
              Windows 11 Launcher
            </p>
            <h1 class="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-white">
              DeskRun
            </h1>
          </div>
          <div class="rounded-full border border-white/12 bg-black/10 px-4 py-2 text-sm text-white/52">
            {feedback() || "Left-click to launch, right-click for actions"}
          </div>
        </div>

        <SearchBar
          query={query()}
          hotkey={settings().hotkey}
          inputRef={(element) => {
            searchInput = element;
          }}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onAddApp={handlePickApp}
          onAddFolder={handlePickFolder}
          onAddUrl={() => setEditorState({ mode: "create-url", item: null })}
          onAddCommand={() => setEditorState({ mode: "create-command", item: null })}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <GroupTabs
          groups={groups()}
          currentGroupId={currentGroupId()}
          onSelect={setCurrentGroupId}
        />

        <ItemGrid
          items={visibleItems()}
          activeItemId={selectedItemId()}
          sortable={!query()}
          onSelect={(item) => setSelectedItemId(item.id)}
          onPreviewHover={scheduleHoverPreview}
          onPreviewLeave={clearHoverPreview}
          onLaunch={handleLaunch}
          onContextMenu={(item, x, y) => {
            setSelectedItemId(item.id);
            clearHoverPreview();
            setContextMenu({ item, x, y });
          }}
          onReorder={handleReorder}
        />
      </div>

      <Show when={hoverPreviewDisplay()}>
        {(preview) => (
        <div
          class="pointer-events-none absolute z-40 w-[360px] overflow-hidden rounded-[24px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(129,168,255,0.18),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(106,208,255,0.12),transparent_34%),linear-gradient(180deg,rgba(14,20,32,0.97),rgba(8,12,20,0.97))] shadow-[0_28px_70px_rgba(0,0,0,0.38),0_10px_24px_rgba(17,24,39,0.24)] backdrop-blur-2xl"
          style={{
            left: `${preview().left}px`,
            top: `${preview().top}px`,
          }}
        >
          <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_24%,transparent_52%)]" />
          <div class="absolute inset-px rounded-[23px] border border-white/[0.04]" />
          <div
            class="absolute h-4 w-4 rotate-45 border border-white/12 bg-[linear-gradient(180deg,rgba(24,34,52,0.98),rgba(10,16,27,0.98))] shadow-[0_8px_18px_rgba(0,0,0,0.2)]"
            style={{
              top: `${preview().arrowTop}px`,
              left: preview().side === "right" ? "-8px" : undefined,
              right: preview().side === "left" ? "-8px" : undefined,
            }}
          />
          <div class="relative flex max-h-[240px] min-h-0 flex-col gap-3 overflow-y-auto p-4 pr-3">
            <Show when={preview().item.kind === "command"}>
              <div class="min-w-0 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div class="text-[10px] uppercase tracking-[0.18em] text-sky-100/34">
                  CMD Preview
                </div>
                <div class="mt-2 whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-white/82">
                  {buildCommandPreview(preview().item)}
                </div>
              </div>
            </Show>

            <Show when={preview().item.note?.trim()}>
              <div class="min-w-0 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div class="text-[10px] uppercase tracking-[0.18em] text-sky-100/34">
                  Note
                </div>
                <div class="mt-2 whitespace-pre-wrap break-words text-[12px] leading-6 text-white/74">
                  {preview().item.note}
                </div>
              </div>
            </Show>
          </div>
        </div>
        )}
      </Show>

      <ItemContextMenu
        item={contextMenu()?.item ?? null}
        open={contextMenu() !== null}
        x={contextMenu()?.x ?? 0}
        y={contextMenu()?.y ?? 0}
        onLaunch={handleLaunch}
        onCopyCommand={handleCopyCommand}
        onEdit={(item) => {
          setContextMenu(null);
          setEditorState({ mode: "edit", item });
        }}
        onDelete={handleDelete}
        onClose={() => setContextMenu(null)}
      />

      <ItemEditorDialog
        open={editorState() !== null}
        mode={editorState()?.mode ?? "edit"}
        item={editorState()?.item ?? null}
        groups={groups()}
        onBusyChange={setDialogBusy}
        onClose={() => setEditorState(null)}
        onDelete={async (item) => {
          await handleDelete(item);
          setEditorState(null);
        }}
        onSave={async (payload) => {
          const state = editorState();
          if (state?.mode === "create-url") {
            const created = await createItem({
              kind: "url",
              name: payload.name,
              target: payload.target,
              note: payload.note,
              groupId: payload.groupId,
            });
            setItems((current) => [...current, created]);
            notify("URL shortcut created");
          } else if (state?.mode === "create-command") {
            const created = await createItem({
              kind: "command",
              name: payload.name,
              target: payload.command ?? payload.target,
              command: payload.command,
              note: payload.note,
              fixedArgs: payload.fixedArgs,
              runtimeArgs: payload.runtimeArgs,
              workingDir: payload.workingDir,
              keepOpen: payload.keepOpen,
              groupId: payload.groupId,
            });
            setItems((current) => [...current, created]);
            notify("CMD shortcut created");
          } else if (state?.mode === "edit" && state.item) {
            const updated = await updateItem({
              id: state.item.id,
              name: payload.name,
              target: payload.target,
              command: payload.command,
              note: payload.note,
              fixedArgs: payload.fixedArgs,
              runtimeArgs: payload.runtimeArgs,
              workingDir: payload.workingDir,
              keepOpen: payload.keepOpen,
              groupId: payload.groupId,
              customIconPath: payload.customIconPath,
              clearCustomIcon: payload.clearCustomIcon,
            });
            setItems((current) =>
              current.map((entry) => (entry.id === updated.id ? updated : entry)),
            );
            notify("Launcher item updated");
          }
          setEditorState(null);
        }}
      />

      <SettingsPanel
        open={settingsOpen()}
        settings={settings()}
        configDirectory={configDirectory()}
        windowSizeLimits={windowSizeLimits()}
        groups={groups()}
        onClose={() => setSettingsOpen(false)}
        onSetHotkey={async (value) => {
          const data = await setHotkey(value);
          setSettings(data.settings);
          setWindowSizeLimits(data.windowSizeLimits);
          notify("Hotkey updated");
        }}
        onToggleStartup={async (value) => {
          const data = await setLaunchOnStartup(value);
          setSettings(data.settings);
          setWindowSizeLimits(data.windowSizeLimits);
          notify(value ? "Launch at login enabled" : "Launch at login disabled");
        }}
        onToggleCloseOnLaunch={async (value) => {
          const data = await setCloseOnLaunch(value);
          setSettings(data.settings);
          setWindowSizeLimits(data.windowSizeLimits);
          notify(value ? "Hide after launch enabled" : "Hide after launch disabled");
        }}
        onSetWindowSize={async (width, height) => {
          const data = await setWindowSize(width, height);
          setSettings(data.settings);
          setConfigDirectoryInfo(data.configDirectory);
          setWindowSizeLimits(data.windowSizeLimits);
          notify(
            `Window size updated to ${data.settings.windowWidth} x ${data.settings.windowHeight}`,
          );
        }}
        onChooseConfigDirectory={async () => {
          const result = await open({
            directory: true,
            multiple: false,
          });
          if (typeof result !== "string") {
            return;
          }

          const data = await setConfigDirectory(result);
          setSettings(data.settings);
          setConfigDirectoryInfo(data.configDirectory);
          setWindowSizeLimits(data.windowSizeLimits);
          notify("Config folder updated");
        }}
        onOpenConfigDirectory={async () => {
          await openConfigDirectory();
          notify("Config folder opened");
        }}
        onResetConfigDirectory={async () => {
          const data = await setConfigDirectory(null);
          setSettings(data.settings);
          setConfigDirectoryInfo(data.configDirectory);
          setWindowSizeLimits(data.windowSizeLimits);
          notify("Config folder reset to default");
        }}
        onCreateGroup={async (name) => {
          const group = await createGroup(name);
          setGroups((current) => [...current, group]);
        }}
        onRenameGroup={async (group, name) => {
          const nextGroups = await renameGroup(group.id, name);
          setGroups(nextGroups);
        }}
        onDeleteGroup={async (group) => {
          const nextGroups = await deleteGroup(group.id);
          setGroups(nextGroups);
          setItems((current) =>
            current.map((item) =>
              item.groupId === group.id ? { ...item, groupId: null } : item,
            ),
          );
          if (currentGroupId() === group.id) {
            setCurrentGroupId(null);
          }
        }}
      />
    </LauncherShell>
  );
}

export default App;
