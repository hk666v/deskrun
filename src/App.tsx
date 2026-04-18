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
  renameGroup,
  reorderItems,
  setCloseOnLaunch,
  setHotkey,
  setLaunchOnStartup,
  syncWindowSize,
  setWindowSize,
  updateItem,
} from "./lib/commands";
import { CommandRuntimeDialog } from "./components/CommandRuntimeDialog";
import { GroupTabs } from "./components/GroupTabs";
import { ItemEditorDialog } from "./components/ItemEditorDialog";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { ItemGrid } from "./components/ItemGrid";
import { LauncherShell } from "./components/LauncherShell";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { copyText } from "./lib/clipboard";
import { buildCommandPreview, requiresRuntimeTarget } from "./lib/command-preview";
import type { Group, LaunchItem, Settings, WindowSizeLimits } from "./types";

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

type CommandRuntimeState = {
  item: LaunchItem;
  target: string;
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

function App() {
  const currentWindow = getCurrentWindow();
  const [items, setItems] = createSignal<LaunchItem[]>([]);
  const [groups, setGroups] = createSignal<Group[]>([]);
  const [settings, setSettings] = createSignal<Settings>(DEFAULT_SETTINGS);
  const [windowSizeLimits, setWindowSizeLimits] = createSignal<WindowSizeLimits>(
    DEFAULT_WINDOW_SIZE_LIMITS,
  );
  const [query, setQuery] = createSignal("");
  const [currentGroupId, setCurrentGroupId] = createSignal<string | null>(null);
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null);
  const [editorState, setEditorState] = createSignal<EditorState>(null);
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState>(null);
  const [commandRuntimeState, setCommandRuntimeState] =
    createSignal<CommandRuntimeState>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [dialogBusy, setDialogBusy] = createSignal(false);
  const [draggingExternal, setDraggingExternal] = createSignal(false);
  const [feedback, setFeedback] = createSignal("");
  let searchInput!: HTMLInputElement;

  const visibleItems = createMemo(() => {
    const term = query().trim().toLowerCase();
    return items()
      .filter((item) =>
        currentGroupId() ? item.groupId === currentGroupId() : true,
      )
      .filter((item) => item.name.toLowerCase().includes(term))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  });

  const selectedItem = createMemo(
    () => visibleItems().find((item) => item.id === selectedItemId()) ?? null,
  );

  const selectedCommandPreview = createMemo(() => {
    const item = selectedItem();
    if (!item || item.kind !== "command") {
      return null;
    }

    return buildCommandPreview(item);
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
    setWindowSizeLimits(data.windowSizeLimits);
    syncSelection(data.items);
  };

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

  const performLaunch = async (item: LaunchItem, runtimeTarget?: string) => {
    setContextMenu(null);
    await launchItem(item.id, runtimeTarget);
  };

  const handleLaunch = async (item: LaunchItem) => {
    setContextMenu(null);
    if (requiresRuntimeTarget(item)) {
      setCommandRuntimeState({
        item,
        target: "",
      });
      return;
    }

    await performLaunch(item);
  };

  const submitRuntimeLaunch = async () => {
    const state = commandRuntimeState();
    if (!state) {
      return;
    }

    const runtimeTarget = state.target.trim();
    if (!runtimeTarget) {
      notify("Please enter a runtime target");
      return;
    }

    await performLaunch(state.item, runtimeTarget);
    setCommandRuntimeState(null);
  };

  const handleDelete = async (item: LaunchItem) => {
    setContextMenu(null);
    await deleteItem(item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    notify("Launcher item removed");
  };

  const handleCopyCommand = async (item: LaunchItem) => {
    setContextMenu(null);
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
    setCommandRuntimeState(null);
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

      if (commandRuntimeState()) {
        if (event.key === "Enter") {
          event.preventDefault();
          await submitRuntimeLaunch();
        }
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
        <div class="flex items-center justify-between gap-4 rounded-[24px] px-1 py-1">
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

        <Show when={selectedCommandPreview()}>
          {(preview) => (
            <div class="rounded-[24px] border border-white/12 bg-black/12 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="text-[10px] uppercase tracking-[0.2em] text-white/28">
                    CMD Preview
                  </div>
                  <div
                    class="mt-2 truncate font-mono text-[12px] leading-5 text-white/74"
                    title={preview()}
                  >
                    {preview()}
                  </div>
                </div>
                <Show when={requiresRuntimeTarget(selectedItem()!)}>
                  <div class="shrink-0 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/42">
                    {`{target}`} waits at launch
                  </div>
                </Show>
              </div>
            </div>
          )}
        </Show>

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
          onLaunch={handleLaunch}
          onContextMenu={(item, x, y) => {
            setSelectedItemId(item.id);
            setContextMenu({ item, x, y });
          }}
          onReorder={handleReorder}
        />
      </div>

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
              fixedArgs: payload.fixedArgs,
              runtimeArgsTemplate: payload.runtimeArgsTemplate,
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
              fixedArgs: payload.fixedArgs,
              runtimeArgsTemplate: payload.runtimeArgsTemplate,
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

      <CommandRuntimeDialog
        open={commandRuntimeState() !== null}
        item={commandRuntimeState()?.item ?? null}
        value={commandRuntimeState()?.target ?? ""}
        onInput={(value) =>
          setCommandRuntimeState((current) =>
            current
              ? {
                  ...current,
                  target: value,
                }
              : null,
          )
        }
        onClose={() => setCommandRuntimeState(null)}
        onSubmit={submitRuntimeLaunch}
      />

      <SettingsPanel
        open={settingsOpen()}
        settings={settings()}
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
          setWindowSizeLimits(data.windowSizeLimits);
          notify(
            `Window size updated to ${data.settings.windowWidth} x ${data.settings.windowHeight}`,
          );
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
