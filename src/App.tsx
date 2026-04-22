import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  createGroup,
  createItem,
  deleteGroup,
  deleteItem,
  exportConfig,
  getBootstrapData,
  hideMainWindow,
  importConfig,
  importDiscoveryCandidates,
  importPaths,
  launchItem,
  openConfigDirectory,
  renameGroup,
  reorderGroups,
  reorderItems,
  scanDiscoveryCandidates,
  setConfigDirectory,
  setCloseOnLaunch,
  setDisplayMode,
  setHotkey,
  setLaunchOnStartup,
  syncWindowSize,
  setWindowSize,
  toggleFavorite,
  updateItem,
} from "./lib/commands";
import { GroupTabs } from "./components/GroupTabs";
import { DiscoveryPanel } from "./components/DiscoveryPanel";
import { ItemEditorDialog } from "./components/ItemEditorDialog";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { ItemGrid } from "./components/ItemGrid";
import { LauncherShell } from "./components/LauncherShell";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { copyText } from "./lib/clipboard";
import { buildCommandPreview } from "./lib/command-preview";
import {
  buildSearchIndexEntry,
  calculateSearchScore,
  matchesSearch,
} from "./lib/search";
import type {
  ConfigDirectoryInfo,
  DiscoveryCandidate,
  DiscoveryScanOptions,
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
  displayMode: "grid",
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

const FAVORITES_VIEW_ID = "__favorites__";
const RECENT_VIEW_ID = "__recent__";
const DISCOVERY_VIEW_ID = "__discovery__";
const DEFAULT_DISCOVERY_SCAN_OPTIONS: DiscoveryScanOptions = {
  startMenu: true,
  desktop: true,
  registry: true,
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
  const [discoveryBusy, setDiscoveryBusy] = createSignal(false);
  const [discoveryError, setDiscoveryError] = createSignal("");
  const [discoveryCandidates, setDiscoveryCandidates] = createSignal<DiscoveryCandidate[]>([]);
  const [selectedDiscoveryIds, setSelectedDiscoveryIds] = createSignal<string[]>([]);
  const [hideExistingDiscovery, setHideExistingDiscovery] = createSignal(true);
  const [discoveryQuery, setDiscoveryQuery] = createSignal("");
  const [discoveryScanOptions, setDiscoveryScanOptions] = createSignal<DiscoveryScanOptions>(
    DEFAULT_DISCOVERY_SCAN_OPTIONS,
  );
  let hoverPreviewTimer: number | undefined;
  let pendingHoverPreview: HoverPreviewState = null;
  let searchInput!: HTMLInputElement;

  const searchIndex = createMemo(() =>
    items().map((item) => ({
      item,
      search: buildSearchIndexEntry(item),
    })),
  );

  const defaultItemSort = (left: LaunchItem, right: LaunchItem, view: string | null) => {
    if (view === RECENT_VIEW_ID) {
      return (
        (right.lastLaunchedAt ?? "").localeCompare(left.lastLaunchedAt ?? "") ||
        right.launchCount - left.launchCount ||
        left.name.localeCompare(right.name)
      );
    }
    if (view === FAVORITES_VIEW_ID) {
      return (
        (right.lastLaunchedAt ?? "").localeCompare(left.lastLaunchedAt ?? "") ||
        left.name.localeCompare(right.name)
      );
    }
    return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
  };

  const visibleItems = createMemo(() => {
    const term = query().trim();
    const view = currentGroupId();
    return searchIndex()
      .filter(({ item }) => {
        if (view === FAVORITES_VIEW_ID) {
          return item.isFavorite;
        }
        if (view === RECENT_VIEW_ID) {
          return item.lastLaunchedAt !== null;
        }
        if (view === DISCOVERY_VIEW_ID) {
          return false;
        }
        return view ? item.groupId === view : true;
      })
      .map(({ item, search }) => ({
        item,
        score: term ? calculateSearchScore(search, item, term) : 0,
        matches: matchesSearch(search, term),
      }))
      .filter(({ matches }) => matches)
      .sort((left, right) => {
        if (term) {
          return (
            right.score - left.score ||
            defaultItemSort(left.item, right.item, view)
          );
        }
        return defaultItemSort(left.item, right.item, view);
      })
      .map(({ item }) => item);
  });

  const shouldSectionListItems = createMemo(
    () =>
      settings().displayMode === "list" &&
      !query().trim() &&
      currentGroupId() !== FAVORITES_VIEW_ID &&
      currentGroupId() !== RECENT_VIEW_ID &&
      currentGroupId() !== DISCOVERY_VIEW_ID,
  );

  const syncSelection = (nextItems: LaunchItem[]) => {
    if (currentGroupId() === DISCOVERY_VIEW_ID) {
      setSelectedItemId(null);
      return;
    }

    if (nextItems.length === 0) {
      setSelectedItemId(null);
      return;
    }

    if (!nextItems.some((item) => item.id === selectedItemId())) {
      setSelectedItemId(nextItems[0].id);
    }
  };

  const applyBootstrapData = (data: Awaited<ReturnType<typeof getBootstrapData>>) => {
    setItems(data.items);
    setGroups(data.groups);
    setSettings(data.settings);
    setConfigDirectoryInfo(data.configDirectory);
    setWindowSizeLimits(data.windowSizeLimits);
    syncSelection(data.items);
  };

  const refresh = async () => {
    const data = await getBootstrapData();
    applyBootstrapData(data);
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

  const runDiscoveryScan = async () => {
    setDiscoveryBusy(true);
    setDiscoveryError("");
    try {
      const candidates = await scanDiscoveryCandidates(discoveryScanOptions());
      setDiscoveryCandidates(candidates);
      setSelectedDiscoveryIds(
        candidates
          .filter((candidate) => !candidate.alreadyExists)
          .map((candidate) => candidate.id),
      );
      if (currentGroupId() !== DISCOVERY_VIEW_ID) {
        setCurrentGroupId(DISCOVERY_VIEW_ID);
      }
      notify(`Discovered ${candidates.length} app candidate(s)`);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to scan apps right now.";
      setDiscoveryError(message);
      notify(message);
    } finally {
      setDiscoveryBusy(false);
    }
  };

  const importDiscoveryPayload = async (
    payload: Array<Pick<DiscoveryCandidate, "name" | "kind" | "target">>,
    importedIds?: string[],
  ) => {
    setDiscoveryBusy(true);
    setDiscoveryError("");
    try {
      const created = await importDiscoveryCandidates(payload);
      if (created.length > 0) {
        setItems((current) => [...current, ...created]);
        if (importedIds && importedIds.length > 0) {
          const selected = new Set(importedIds);
          setDiscoveryCandidates((current) =>
            current.map((candidate) =>
              selected.has(candidate.id) ? { ...candidate, alreadyExists: true } : candidate,
            ),
          );
        }
        notify(`Imported ${created.length} discovered app(s)`);
      } else {
        notify("No new discovered apps were imported");
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to import selected apps.";
      setDiscoveryError(message);
      notify(message);
    } finally {
      setDiscoveryBusy(false);
    }
  };

  const importSelectedDiscoveryItems = async () => {
    const selected = new Set(selectedDiscoveryIds());
    const payload = discoveryCandidates()
      .filter((candidate) => selected.has(candidate.id) && !candidate.alreadyExists)
      .map(({ name, kind, target }) => ({ name, kind, target }));

    if (payload.length === 0) {
      notify("No new discovered apps were selected");
      return;
    }

    await importDiscoveryPayload(payload, [...selected]);
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
    const launched = await launchItem(item.id);
    setItems((current) =>
      current.map((entry) => (entry.id === launched.id ? launched : entry)),
    );
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
    try {
      await performLaunch(item);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Launch failed";
      notify(`Launch failed: ${message}`);
    }
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

  const handleToggleFavorite = async (item: LaunchItem) => {
    setContextMenu(null);
    clearHoverPreview();
    const updated = await toggleFavorite(item.id, !item.isFavorite);
    setItems((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
    notify(updated.isFavorite ? "Pinned" : "Unpinned");
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

  const handleReorderGroups = async (
    fromId: string,
    toId: string,
    placement: "before" | "after",
  ) => {
    const nextIds = groups().map((group) => group.id);
    const fromIndex = nextIds.indexOf(fromId);
    const toIndex = nextIds.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }

    const [moved] = nextIds.splice(fromIndex, 1);
    const targetIndex = nextIds.indexOf(toId);
    const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
    nextIds.splice(insertIndex, 0, moved);
    const updatedGroups = await reorderGroups(nextIds);
    setGroups(updatedGroups);
  };

  const moveSelection = (delta: number) => {
    if (currentGroupId() === DISCOVERY_VIEW_ID) {
      return;
    }

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

  const selectionStep = (direction: "horizontal" | "vertical", delta: number) => {
    if (settings().displayMode === "list") {
      return direction === "vertical" ? delta : 0;
    }

    return direction === "vertical" ? delta * 4 : delta;
  };

  const hideLauncher = async () => {
    setEditorState(null);
    setSettingsOpen(false);
    setContextMenu(null);
    clearHoverPreview();
    await hideMainWindow();
  };

  const handleAppKeyDown = async (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      await hideLauncher();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(selectionStep("horizontal", 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(selectionStep("horizontal", -1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(selectionStep("vertical", 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(selectionStep("vertical", -1));
    } else if (event.key === "Enter") {
      const item = visibleItems().find((entry) => entry.id === selectedItemId());
      if (item) {
        event.preventDefault();
        await handleLaunch(item);
      }
    }
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

    document.addEventListener("keydown", handleAppKeyDown, true);

    onCleanup(() => {
      clearHoverPreview();
      unlistenFocus();
      unlistenDragDrop();
      unlistenFocusSearch();
      unlistenResized();
      window.clearTimeout(resizeSyncTimer);
      document.removeEventListener("keydown", handleAppKeyDown, true);
    });
  });

  createEffect(() => {
    syncSelection(visibleItems());
  });

  return (
    <LauncherShell dragging={draggingExternal()}>
      <div class="flex h-full flex-col gap-3">
        <div
          class="flex items-center justify-between gap-4 rounded-[24px] px-1 py-0.5 select-none"
        >
          <h1 class="text-[24px] font-semibold tracking-[-0.03em] text-white">
            DeskRun
          </h1>
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
          discoveryCount={discoveryCandidates().filter((candidate) => !candidate.alreadyExists).length}
          onSelect={setCurrentGroupId}
          onReorderGroups={handleReorderGroups}
        />

        <Show
          when={currentGroupId() === DISCOVERY_VIEW_ID}
          fallback={
            <ItemGrid
              items={visibleItems()}
              viewMode={settings().displayMode}
              activeItemId={selectedItemId()}
              sectioned={shouldSectionListItems()}
              sortable={
                !query() &&
                currentGroupId() !== FAVORITES_VIEW_ID &&
                currentGroupId() !== RECENT_VIEW_ID
              }
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
          }
        >
          <DiscoveryPanel
            busy={discoveryBusy()}
            error={discoveryError()}
            candidates={discoveryCandidates()}
            selectedIds={selectedDiscoveryIds()}
            searchQuery={discoveryQuery()}
            hideExisting={hideExistingDiscovery()}
            scanOptions={discoveryScanOptions()}
            onSearchQueryChange={setDiscoveryQuery}
            onSetHideExisting={setHideExistingDiscovery}
            onSetScanOptions={setDiscoveryScanOptions}
            onToggleAllVisible={(candidateIds, checked) => {
              setSelectedDiscoveryIds((current) => {
                if (checked) {
                  return [...new Set([...current, ...candidateIds])];
                }
                const hidden = new Set(candidateIds);
                return current.filter((id) => !hidden.has(id));
              });
            }}
            onToggleSelected={(candidateId, checked) => {
              setSelectedDiscoveryIds((current) =>
                checked
                  ? current.includes(candidateId)
                    ? current
                    : [...current, candidateId]
                  : current.filter((id) => id !== candidateId),
              );
            }}
            onImportOne={async (candidate) => {
              const matched = discoveryCandidates().find(
                (entry) =>
                  entry.target === candidate.target &&
                  entry.kind === candidate.kind &&
                  entry.name === candidate.name,
              );
              await importDiscoveryPayload(
                [candidate],
                matched ? [matched.id] : undefined,
              );
            }}
            onScan={runDiscoveryScan}
            onImportSelected={importSelectedDiscoveryItems}
          />
        </Show>
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
        onToggleFavorite={handleToggleFavorite}
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
        onSetDisplayMode={async (value) => {
          const data = await setDisplayMode(value);
          setSettings(data.settings);
          setWindowSizeLimits(data.windowSizeLimits);
          notify(value === "list" ? "List view enabled" : "Grid view enabled");
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
        onExportConfig={async () => {
          const result = await open({
            directory: true,
            multiple: false,
          });
          if (typeof result !== "string") {
            return;
          }

          const exportedPath = await exportConfig(result);
          notify(`Config exported to ${exportedPath}`);
        }}
        onImportConfig={async () => {
          const result = await open({
            directory: true,
            multiple: false,
          });
          if (typeof result !== "string") {
            return;
          }

          const data = await importConfig(result);
          applyBootstrapData(data);
          notify("Config imported");
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

      <Show when={feedback()}>
        <div class="pointer-events-none absolute bottom-5 right-5 z-40 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,30,0.94),rgba(12,20,32,0.9))] px-4 py-2 text-sm text-white/72 shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          {feedback()}
        </div>
      </Show>
    </LauncherShell>
  );
}

export default App;
