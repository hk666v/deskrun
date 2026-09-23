import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  createGroup,
  createItem,
  deleteGroup,
  deleteItem,
  duplicateItem,
  exportConfig,
  getBootstrapData,
  hideMainWindow,
  importConfig,
  importDiscoveryCandidates,
  importPaths,
  launchItem,
  launchItemAsAdmin,
  openConfigDirectory,
  renameGroup,
  reorderGroups,
  reorderItems,
  scanDiscoveryCandidates,
  setConfigDirectory,
  setCloseOnLaunch,
  setDisplayMode,
  setFollowCursorMonitor,
  setHotkey,
  setLaunchOnStartup,
  setUiScale,
  syncWindowSize,
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
import { buildQueryActions, type QueryAction } from "./lib/query-actions";
import { revealItemLocation } from "./lib/location";
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

/// The panel's entrance state: hidden with the window, playing its entrance, or
/// simply sitting there.
type SummonPhase = "dormant" | "entering" | "idle";

const DEFAULT_SETTINGS: Settings = {
  hotkey: "Alt+Space",
  launchOnStartup: false,
  closeOnLaunch: true,
  themeMode: "system",
  displayMode: "grid",
  windowWidth: 760,
  windowHeight: 560,
  followCursorMonitor: true,
  uiScale: 1,
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

/// Turns anything a rejected `invoke` can throw into a line the user can read.
/// Tauri rejects with the plain string the Rust side returned.
function describeError(error: unknown) {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function App() {
  const currentWindow = getCurrentWindow();
  const [items, setItems] = createSignal<LaunchItem[]>([]);
  const [groups, setGroups] = createSignal<Group[]>([]);
  const [settings, setSettings] = createSignal<Settings>(DEFAULT_SETTINGS);
  const [configDirectory, setConfigDirectoryInfo] =
    createSignal<ConfigDirectoryInfo>(DEFAULT_CONFIG_DIRECTORY);
  const [query, setQuery] = createSignal("");
  const [currentGroupId, setCurrentGroupId] = createSignal<string | null>(null);
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null);
  const [gridColumns, setGridColumns] = createSignal(3);
  const [editorState, setEditorState] = createSignal<EditorState>(null);
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState>(null);
  const [hoverPreview, setHoverPreview] = createSignal<HoverPreviewState>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [dialogBusy, setDialogBusy] = createSignal(false);
  const [draggingExternal, setDraggingExternal] = createSignal(false);
  /// Drives the entrance animation. The window is hidden and shown rather than
  /// remounted, so nothing plays on its own.
  ///
  /// `dormant` is the state the panel waits in while the window is hidden: the
  /// show reaches the frontend as an event, which lands a few frames after the
  /// window is already on screen, so a panel that was still painted would flash
  /// at full size and then fade in from nothing.
  const [summonPhase, setSummonPhase] = createSignal<SummonPhase>("dormant");
  const [feedback, setFeedback] = createSignal("");
  const [startupWarning, setStartupWarning] = createSignal("");
  /// Destructive actions queue here so they can be confirmed in the app rather
  /// than through a native dialog, which would blur the window and hide it.
  const [pendingAction, setPendingAction] = createSignal<{
    message: string;
    confirm: string;
    action: () => Promise<void>;
  } | null>(null);
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
  let feedbackTimer: number | undefined;
  let summonTimer: number | undefined;

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

  /// Offered only when nothing matched, so a real item always wins over a guess
  /// at what the query might mean.
  const queryActions = createMemo(() =>
    visibleItems().length === 0 && currentGroupId() !== DISCOVERY_VIEW_ID
      ? buildQueryActions(query())
      : [],
  );

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
    setStartupWarning(data.startupWarning ?? "");
    syncSelection(data.items);
  };

  /// Every settings command answers with the full bootstrap payload, but only
  /// these fields can have changed.
  const applySettingsResponse = (data: Awaited<ReturnType<typeof getBootstrapData>>) => {
    setSettings(data.settings);
    setConfigDirectoryInfo(data.configDirectory);
    setStartupWarning(data.startupWarning ?? "");
  };

  const refresh = async () => {
    try {
      const data = await getBootstrapData();
      applyBootstrapData(data);
    } catch (error) {
      // Nothing downstream can work without this data, so say so instead of
      // leaving the user staring at a permanently empty window.
      setFeedback(`Could not load your launcher data: ${describeError(error)}`);
    }
  };

  const hoverPreviewPosition = createMemo(() => {
    const state = hoverPreview();
    if (!state) {
      return null;
    }

    const margin = 16;
    // Proportional to the window so a 760px launcher does not get a preview
    // covering most of itself.
    const panelWidth = Math.min(420, Math.max(280, Math.round(window.innerWidth * 0.45)));
    const panelHeight = 240;
    const gap = 18;
    const canPlaceRight = state.x + gap + panelWidth <= window.innerWidth - margin;
    const left = canPlaceRight
      ? state.x + gap
      : Math.max(margin, state.x - gap - panelWidth);
    const maxY = Math.max(margin, window.innerHeight - panelHeight - margin);
    const top = Math.min(Math.max(state.y - 18, margin), maxY);
    const arrowTop = Math.min(Math.max(state.y - top - 10, 18), panelHeight - 28);

    return {
      width: panelWidth,
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
    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => setFeedback(""), 2200);
  };

  /// Runs a command and surfaces a rejection. Several of these calls used to
  /// fail completely silently — saving an item with an empty command field did
  /// nothing at all, with no error and no change to the dialog.
  const run = async (action: () => Promise<void>, failureMessage: string) => {
    try {
      await action();
    } catch (error) {
      notify(`${failureMessage}: ${describeError(error)}`);
    }
  };

  /// Runs an action that opens a native window or hands a folder to the shell.
  /// The WebView loses focus while that is on screen, and the focus handler
  /// would otherwise hide the launcher out from under the user.
  const withNativeDialog = async <T,>(action: () => Promise<T>): Promise<T> => {
    setDialogBusy(true);
    try {
      return await action();
    } finally {
      setDialogBusy(false);
    }
  };

  const runDiscoveryScan = async () => {
    setDiscoveryBusy(true);
    setDiscoveryError("");
    try {
      const candidates = await scanDiscoveryCandidates(discoveryScanOptions());
      setDiscoveryCandidates(candidates);
      // Only what Windows itself presents as a program is pre-selected. Every
      // registry entry is either declared by the vendor or inferred from a
      // folder listing, and an inferred one can just as easily be a helper tool
      // as the app — pre-selecting those is how a curated launcher becomes three
      // hundred rows nobody asked for.
      setSelectedDiscoveryIds(
        candidates
          .filter(
            (candidate) => !candidate.alreadyExists && candidate.confidence === "high",
          )
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
          // The boxes would otherwise stay ticked on rows that are now disabled.
          setSelectedDiscoveryIds([]);
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
    await run(async () => {
      const result = await withNativeDialog(() =>
        open({
          multiple: true,
          filters: [{ name: "Apps", extensions: ["exe", "lnk"] }],
        }),
      );

      if (Array.isArray(result)) {
        await importSelectedPaths(result);
      } else if (typeof result === "string") {
        await importSelectedPaths([result]);
      }
    }, "Could not add those items");
  };

  const handlePickFolder = async () => {
    await run(async () => {
      const result = await withNativeDialog(() =>
        open({
          directory: true,
          multiple: true,
        }),
      );

      if (Array.isArray(result)) {
        await importSelectedPaths(result);
      } else if (typeof result === "string") {
        await importSelectedPaths([result]);
      }
    }, "Could not add that folder");
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
      notify(`Launch failed: ${describeError(error)}`);
    }
  };

  /// Runs one of the actions offered when nothing matched the query.
  const runQueryAction = async (action: QueryAction) => {
    clearHoverPreview();
    await run(async () => {
      await action.run();
      notify(action.done);
    }, "Could not complete that");
  };

  /// Where a keyboard-opened context menu should appear: against the selected
  /// card, so it lands where the user is already looking.
  const selectedCardAnchor = () => {
    const id = selectedItemId();
    if (!id) {
      return null;
    }

    const card = document.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
    if (!card) {
      return null;
    }

    const rect = card.getBoundingClientRect();
    return { x: rect.left + 12, y: rect.top + 12 };
  };

  const openSelectedContextMenu = () => {
    const item = visibleItems().find((entry) => entry.id === selectedItemId());
    const anchor = selectedCardAnchor();
    if (!item || !anchor) {
      return;
    }

    clearHoverPreview();
    setContextMenu({ item, x: anchor.x, y: anchor.y });
  };

  /// Enter means "do the obvious thing": launch the highlighted item, or fall
  /// back to the first offered action when nothing matched.
  const hasConfirmation = () =>
    visibleItems().some((entry) => entry.id === selectedItemId()) ||
    queryActions().length > 0;

  const confirmSelection = async () => {
    const item = visibleItems().find((entry) => entry.id === selectedItemId());
    if (item) {
      await handleLaunch(item);
      return;
    }

    const action = queryActions()[0];
    if (action) {
      await runQueryAction(action);
    }
  };

  const handleDelete = (item: LaunchItem) => {
    setContextMenu(null);
    clearHoverPreview();
    // Confirmed in-app rather than through a native dialog, which would take
    // focus off the webview and make the launcher hide itself.
    setPendingAction({
      message: `Delete “${item.name}”? This cannot be undone.`,
      confirm: "Delete",
      action: async () => {
        await deleteItem(item.id);
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        notify("Launcher item removed");
      },
    });
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
    await run(async () => {
      const updated = await toggleFavorite(item.id, !item.isFavorite);
      setItems((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      notify(updated.isFavorite ? "Pinned" : "Unpinned");
    }, "Could not update the pin");
  };

  /// Elevates for this one run regardless of the item's own setting, so a UAC
  /// prompt appears even for something normally launched unelevated.
  const handleLaunchAsAdmin = async (item: LaunchItem) => {
    setContextMenu(null);
    clearHoverPreview();
    await run(async () => {
      const launched = await launchItemAsAdmin(item.id);
      setItems((current) =>
        current.map((entry) => (entry.id === launched.id ? launched : entry)),
      );
      notify(`Ran ${item.name} as administrator`);
    }, "Could not run that as administrator");
  };

  const handleDuplicate = async (item: LaunchItem) => {
    setContextMenu(null);
    clearHoverPreview();
    await run(async () => {
      const copy = await duplicateItem(item.id);
      setItems((current) => [...current, copy]);
      notify(`Duplicated as “${copy.name}”`);
    }, "Could not duplicate that item");
  };

  /// Shows the item on disk — the containing folder with the file selected, or
  /// the folder itself for a folder item.
  const handleRevealLocation = async (item: LaunchItem) => {
    setContextMenu(null);
    clearHoverPreview();
    await run(
      () => revealItemLocation(item),
      `Could not show ${item.name} on disk`,
    );
  };

  /// Reports whether the group was created so the tab strip's inline editor can
  /// stay open when the name is rejected.
  const handleCreateGroup = async (name: string): Promise<boolean> => {    try {
      const group = await createGroup(name);
      setGroups((current) => [...current, group]);
      notify(`Group “${group.name}” created`);
      return true;
    } catch (error) {
      notify(`Could not create the group: ${describeError(error)}`);
      return false;
    }
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

    // Vertical moves must jump exactly one rendered row, which is however many
    // columns the grid actually has at the current window width.
    return direction === "vertical" ? delta * gridColumns() : delta;
  };

  const hideLauncher = async () => {
    setEditorState(null);
    setSettingsOpen(false);
    setContextMenu(null);
    clearHoverPreview();
    await hideMainWindow();
    // Only once it is off screen: going dormant while the window is still
    // painted would blink the panel out on the way.
    setSummonPhase("dormant");
  };

  const handleAppKeyDown = async (event: KeyboardEvent) => {
    // An in-flight IME composition owns Enter. For a Chinese user that key
    // commits a candidate, and treating it as "launch" fired off whatever the
    // grid happened to have selected.
    if (event.isComposing || event.keyCode === 229) {
      return;
    }

    const target = event.target as HTMLElement | null;

    // An inline editor owns its own Enter and Escape. Without this, pressing
    // Escape to cancel a group name would hide the entire launcher instead.
    if (target?.closest("[data-inline-editor]")) {
      return;
    }

    if (event.key === "Escape" || event.code === "Escape") {
      // Escape unwinds one layer at a time, and the launcher only hides once
      // there is nothing left to close. It used to clear every overlay and hide
      // the window in one press, silently discarding unsaved edits.
      event.preventDefault();
      if (contextMenu()) {
        setContextMenu(null);
      } else if (editorState()) {
        setEditorState(null);
      } else if (settingsOpen()) {
        setSettingsOpen(false);
      } else {
        await hideLauncher();
      }
      return;
    }

    // Enter in the search box means "launch the highlighted result", or the
    // first offered action when nothing matched.
    if (target === searchInput && event.key === "Enter") {
      if (hasConfirmation()) {
        event.preventDefault();
        await confirmSelection();
      }
      return;
    }

    // Shift+F10 and the Menu key are Windows' shortcut for a context menu. The
    // grid is keyboard-driven everywhere else, so its actions have to be
    // reachable without a mouse.
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      openSelectedContextMenu();
      return;
    }

    // Everything below belongs to the launcher surface, so stand down while an
    // overlay is open: the dialog, drawer, or menu owns the keyboard.
    if (editorState() || settingsOpen() || contextMenu()) {
      return;
    }

    // Left/right belong to the caret in any text field. Up/down belong to the
    // results, because a single-line field has no vertical caret to move — but
    // a textarea moves between lines and a select or number input steps its
    // value, so those keep theirs.
    const inTextEntry = Boolean(
      target?.closest("input, textarea, select, [contenteditable='true']"),
    );
    const ownsVerticalArrows = Boolean(
      target?.closest("textarea, select, input[type='number']"),
    );

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (inTextEntry) {
        return;
      }
      event.preventDefault();
      moveSelection(selectionStep("horizontal", event.key === "ArrowRight" ? 1 : -1));
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (ownsVerticalArrows) {
        return;
      }
      event.preventDefault();
      moveSelection(selectionStep("vertical", event.key === "ArrowDown" ? 1 : -1));
      return;
    }

    // A focused button activates natively on Enter and Space. Intercepting it
    // meant Enter on "Add" or "Save" launched an unrelated item instead.
    if (target?.closest("button")) {
      return;
    }

    if (event.key === "Enter" && hasConfirmation()) {
      event.preventDefault();
      await confirmSelection();
    }
  };

  // Put the caret back in the search box whenever the last overlay closes, so
  // the user can carry on typing instead of clicking back into it. Focus used
  // to land on `body`, meaning the next keystroke went nowhere.
  createEffect(() => {
    const overlayOpen = Boolean(editorState() || settingsOpen() || contextMenu());
    if (!overlayOpen) {
      searchInput?.focus();
    }
  });

  onMount(async () => {
    let resizeSyncTimer: number | undefined;
    let syncingResize = false;
    let summonListenerReady = false;
    const unlisteners: Array<() => void> = [];

    // One listener failing to register must not stop the app from loading its
    // data, so each registration stands alone. Awaiting them before `refresh()`
    // keeps the cold-start ordering: the window can be summoned the instant it
    // exists, and a listener attached afterwards would miss that request.
    const register = async (setup: () => Promise<() => void>) => {
      try {
        unlisteners.push(await setup());
      } catch (error) {
        console.warn("deskrun: could not register a window listener", error);
      }
    };

    await register(() =>
      currentWindow.onFocusChanged(async ({ payload }) => {
        if (!payload && !dialogBusy()) {
          await currentWindow.hide();
          setSummonPhase("dormant");
        }
      }),
    );

    await register(() =>
      currentWindow.onDragDropEvent(async (event) => {
        if (event.payload.type === "over") {
          setDraggingExternal(true);
        } else if (event.payload.type === "drop") {
          setDraggingExternal(false);
          const { paths } = event.payload;
          await run(
            () => importSelectedPaths(paths),
            "Could not import those files",
          );
        } else {
          setDraggingExternal(false);
        }
      }),
    );

    await register(async () => {
      const unlisten = await listen("deskrun://focus-search", () => {
        searchInput?.focus();
        searchInput?.select();

        // The animation only replays if the class leaves the element first, so
        // it is cleared on a timer rather than left on for the session.
        setSummonPhase("entering");
        window.clearTimeout(summonTimer);
        summonTimer = window.setTimeout(() => setSummonPhase("idle"), 240);
      });
      summonListenerReady = true;
      return unlisten;
    });

    // Nothing summons a window in the browser preview, so the panel would wait
    // behind an invisible window forever during `npm run dev`.
    if (!summonListenerReady) {
      setSummonPhase("idle");
    }

    await register(() =>
      currentWindow.onResized(async () => {
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
            setSettings(await syncWindowSize(width, height));
          } catch (error) {
            // Not worth a toast on every drag frame; the next resize retries.
            console.warn("deskrun: could not record the window size", error);
          } finally {
            window.setTimeout(() => {
              syncingResize = false;
            }, 0);
          }
        }, 140);
      }),
    );

    document.addEventListener("keydown", handleAppKeyDown, true);

    await refresh();

    // Start with the caret in the search box so the first keystroke lands
    // somewhere instead of being swallowed by the shell.
    searchInput?.focus();

    onCleanup(() => {
      clearHoverPreview();
      unlisteners.forEach((unlisten) => unlisten());
      window.clearTimeout(resizeSyncTimer);
      window.clearTimeout(summonTimer);
      document.removeEventListener("keydown", handleAppKeyDown, true);
    });
  });

  createEffect(() => {
    syncSelection(visibleItems());
  });

  return (
    <LauncherShell
      dragging={draggingExternal()}
      summonPhase={summonPhase()}
      uiScale={settings().uiScale}
    >
      <div class="flex h-full flex-col gap-4">
        {/* The wordmark and the field under it are one block, so the space
            between them is theirs to set. Left to the column's uniform gap the
            title floated with a hole under it — and on a band this wide, with
            nothing anchoring the far end, the hole was most of the header.
            The band doubles as the window's drag target: the strip in
            LauncherShell covers this row plus the gap under it. */}
        <div class="flex shrink-0 flex-col gap-2">
          <div class="flex h-6 items-center select-none">
            {/* The wordmark is the one place the accent is allowed to be purely
                decorative: it is where the eye lands first, and a lit name
                reads as "this thing is on". */}
            <h1 class="bg-gradient-to-r from-fg to-signal bg-clip-text text-display font-semibold tracking-tight text-transparent drop-shadow-[0_0_18px_var(--color-signal-soft)]">
              DeskRun
            </h1>
          </div>

          {/* Startup problems such as "the hotkey was taken" are not transient, so
              they live here rather than in the two-second toast. */}
          <Show when={startupWarning()}>
            <div
              role="status"
              class="flex items-start gap-3 rounded-sharp border border-danger-soft px-3 py-2"
            >
              <p class="min-w-0 flex-1 text-label text-danger">{startupWarning()}</p>
              <button
                type="button"
                onClick={() => setStartupWarning("")}
                class="shrink-0 rounded-sharp px-2 py-0.5 text-meta text-fg-subtle transition-colors duration-100 hover:bg-fill hover:text-fg"
              >
                Dismiss
              </button>
            </div>
          </Show>

          {/* The tabs belong to the search above them, so the two sit close
              together. With the column's uniform gap they floated midway between
              two equal spaces, which read as the strip being too tall. What is
              left is a hairline: the labels are meant to hang off the search
              field's rule, and any more space reads as the strip drifting away
              from the field it belongs to. */}
          <div class="flex shrink-0 flex-col gap-0.5">
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
              onCreateGroup={handleCreateGroup}
            />
          </div>
        </div>

        <Show
          when={currentGroupId() === DISCOVERY_VIEW_ID}
          fallback={
            <ItemGrid
              items={visibleItems()}
              viewMode={settings().displayMode}
              activeItemId={selectedItemId()}
              sectioned={shouldSectionListItems()}
              query={query()}
              viewId={currentGroupId()}
              queryActions={queryActions()}
              onRunQueryAction={runQueryAction}
              onColumnsChange={setGridColumns}
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
            onScan={runDiscoveryScan}
            onImportSelected={importSelectedDiscoveryItems}
          />
        </Show>
      </div>

      <Show when={hoverPreviewDisplay()}>
        {(preview) => (
        <div
          class="pointer-events-none fixed z-float animate-pop-in overflow-hidden rounded-panel border border-line-strong bg-raised shadow-overlay"
          style={{
            width: `${preview().width}px`,
            left: `${preview().left}px`,
            top: `${preview().top}px`,
          }}
        >
          <div class="relative flex max-h-[240px] min-h-0 flex-col gap-3 overflow-y-auto p-3">
            <Show when={preview().item.kind === "command"}>
              <div class="min-w-0 border-l border-line pl-2">
                <div class="text-micro text-fg-subtle">Command</div>
                <div class="mt-1 font-mono text-data break-all whitespace-pre-wrap text-fg-muted">
                  {buildCommandPreview(preview().item)}
                </div>
              </div>
            </Show>

            <Show when={preview().item.note?.trim()}>
              <div class="min-w-0 border-l border-line pl-2">
                <div class="text-micro text-fg-subtle">Note</div>
                <div class="mt-1 text-label break-words whitespace-pre-wrap text-fg-muted">
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
        onLaunchAsAdmin={handleLaunchAsAdmin}
        onToggleFavorite={handleToggleFavorite}
        onDuplicate={handleDuplicate}
        onCopyCommand={handleCopyCommand}
        onRevealLocation={handleRevealLocation}
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
              runAsAdmin: payload.runAsAdmin,
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
              runAsAdmin: payload.runAsAdmin,
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
        groups={groups()}
        onClose={() => setSettingsOpen(false)}
        onSetHotkey={(value) =>
          run(async () => {
            applySettingsResponse(await setHotkey(value));
            notify("Hotkey updated");
          }, "Could not register that hotkey")
        }
        onToggleStartup={(value) =>
          run(async () => {
            applySettingsResponse(await setLaunchOnStartup(value));
            notify(value ? "Launch at login enabled" : "Launch at login disabled");
          }, "Could not change the login item")
        }
        onToggleCloseOnLaunch={(value) =>
          run(async () => {
            applySettingsResponse(await setCloseOnLaunch(value));
            notify(value ? "Hide after launch enabled" : "Hide after launch disabled");
          }, "Could not change that setting")
        }
        onToggleFollowCursor={(value) =>
          run(async () => {
            applySettingsResponse(await setFollowCursorMonitor(value));
            notify(
              value
                ? "Opening on the monitor with the pointer"
                : "Reusing the last window position",
            );
          }, "Could not change that setting")
        }
        onSetDisplayMode={(value) =>
          run(async () => {
            applySettingsResponse(await setDisplayMode(value));
            notify(value === "list" ? "List view enabled" : "Grid view enabled");
          }, "Could not switch the view")
        }
        onSetUiScale={(value) =>
          run(async () => {
            applySettingsResponse(await setUiScale(value));
            notify(`Interface at ${Math.round(value * 100)}%`);
          }, "Could not change the interface size")
        }
        onChooseConfigDirectory={() =>
          run(async () => {
            const result = await withNativeDialog(() =>
              open({ directory: true, multiple: false }),
            );
            if (typeof result !== "string") {
              return;
            }

            applySettingsResponse(await setConfigDirectory(result));
            notify("Config folder updated");
          }, "Could not change the config folder")
        }
        onOpenConfigDirectory={() =>
          run(async () => {
            await withNativeDialog(() => openConfigDirectory());
            notify("Config folder opened");
          }, "Could not open the config folder")
        }
        onResetConfigDirectory={() =>
          run(async () => {
            applySettingsResponse(await setConfigDirectory(null));
            notify("Config folder reset to default");
          }, "Could not reset the config folder")
        }
        onExportConfig={() =>
          run(async () => {
            const result = await withNativeDialog(() =>
              open({ directory: true, multiple: false }),
            );
            if (typeof result !== "string") {
              return;
            }

            notify(`Config exported to ${await exportConfig(result)}`);
          }, "Could not export the config")
        }
        onImportConfig={() =>
          run(async () => {
            const result = await withNativeDialog(() =>
              open({ directory: true, multiple: false }),
            );
            if (typeof result !== "string") {
              return;
            }

            applyBootstrapData(await importConfig(result));
            notify("Config imported");
          }, "Could not import the config")
        }
        onCreateGroup={async (name) => {
          const group = await createGroup(name);
          setGroups((current) => [...current, group]);
        }}
        onRenameGroup={async (group, name) => {
          const nextGroups = await renameGroup(group.id, name);
          setGroups(nextGroups);
        }}
        onDeleteGroup={(group) => {
          // Deleting a group also ungroups everything in it, which is a much
          // bigger change than the button suggests, so say how many items are
          // affected and let the user back out.
          const affected = items().filter((item) => item.groupId === group.id).length;
          setPendingAction({
            message:
              affected > 0
                ? `Delete the group “${group.name}”? ${affected} item(s) will move to Ungrouped.`
                : `Delete the group “${group.name}”?`,
            confirm: "Delete group",
            action: async () => {
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
              notify("Group removed");
            },
          });
        }}
      />

      <Show when={pendingAction()}>
        {(pending) => (
          <div class="fixed inset-x-0 bottom-0 z-toast flex animate-pop-in items-center gap-3 border-t border-line bg-raised px-4 py-3 shadow-overlay">
            <p class="min-w-0 flex-1 text-label text-fg-muted">{pending().message}</p>
            <button
              type="button"
              onClick={async () => {
                const queued = pending();
                setPendingAction(null);
                await run(queued.action, "Could not complete that");
              }}
              class="shrink-0 rounded-sharp border border-danger-soft px-3 py-1 text-label text-danger transition-colors duration-100 hover:bg-danger-soft"
            >
              {pending().confirm}
            </button>
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              class="shrink-0 rounded-sharp border border-line px-3 py-1 text-label text-fg-muted transition-colors duration-100 hover:bg-fill hover:text-fg"
            >
              Cancel
            </button>
          </div>
        )}
      </Show>

      <Show when={feedback()}>
        <div
          role="status"
          aria-live="polite"
          class="pointer-events-none fixed right-4 bottom-4 z-toast animate-pop-in rounded-sharp border border-line bg-raised px-3 py-2 text-label text-fg-muted shadow-overlay"
        >
          {feedback()}
        </div>
      </Show>
    </LauncherShell>
  );
}

export default App;
