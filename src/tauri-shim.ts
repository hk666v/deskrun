/**
 * Browser-only shim for the Tauri IPC bridge.
 *
 * `getCurrentWindow()` runs during component setup (App.tsx, LauncherShell.tsx) and
 * reads `window.__TAURI_INTERNALS__.metadata` immediately, so under plain Vite the
 * whole tree throws before it can render. This installs the minimum surface those
 * modules touch so `npm run dev` can render real markup for visual work.
 *
 * Read commands answer from dev-fixture.ts, so grid, list, discovery, editor and
 * settings can all be exercised without compiling the Rust side. Anything that
 * would touch the OS (launching, file pickers, window control) rejects.
 *
 * Under a real Tauri window `__TAURI_INTERNALS__` already exists and this is a no-op.
 * The whole block is dead code in production builds.
 */
import {
  fixtureBootstrap,
  fixtureDiscoveryCandidates,
  fixtureGroups,
  fixtureItems,
} from "./dev-fixture";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      metadata: {
        currentWindow: { label: string };
        currentWebview: { label: string; windowLabel: string };
      };
      invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      transformCallback: (callback: (payload: unknown) => void) => number;
      unregisterCallback: (id: number) => void;
      convertFileSrc: (filePath: string) => string;
    };
  }
}

if (import.meta.env.DEV && !window.__TAURI_INTERNALS__) {
  const callbacks = new Map<number, (payload: unknown) => void>();
  let nextCallbackId = 0;
  let displayMode: "grid" | "list" = "list";

  const bootstrap = () => fixtureBootstrap(displayMode);

  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    get_bootstrap_data: bootstrap,
    scan_discovery_candidates: () => fixtureDiscoveryCandidates,
    set_display_mode: (args) => {
      displayMode = args.displayMode as "grid" | "list";
      return bootstrap();
    },
    set_hotkey: bootstrap,
    set_launch_on_startup: bootstrap,
    set_close_on_launch: bootstrap,
    sync_window_size: () => bootstrap().settings,
    set_config_directory: bootstrap,
    reorder_groups: () => fixtureGroups,
    create_group: (args) => {
      const name = String(args.name).trim();

      // Mirrors the backend's uniqueness rule, so the dev environment rejects
      // exactly the names the real one does.
      if (fixtureGroups.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
        return Promise.reject("group name already exists");
      }

      // Persist, then return the single new group — the shape the real command
      // answers with, not the whole list.
      const group = {
        id: `fixture-group-${Date.now()}`,
        name,
        sortOrder: fixtureGroups.length,
      };
      fixtureGroups.push(group);
      return group;
    },
    delete_item: () => undefined,
    hide_main_window: () => undefined,
    open_config_directory: () => undefined,
    launch_item: (args) => {
      const found = fixtureItems.find((entry) => entry.id === args.itemId);
      return found ? { ...found, launchCount: found.launchCount + 1 } : undefined;
    },
    launch_item_as_admin: (args) => {
      const found = fixtureItems.find((entry) => entry.id === args.itemId);
      return found ? { ...found, launchCount: found.launchCount + 1 } : undefined;
    },
    duplicate_item: (args) => {
      const found = fixtureItems.find((entry) => entry.id === args.itemId);
      if (!found) {
        return undefined;
      }
      const copy = {
        ...found,
        id: `fixture-copy-${Date.now()}`,
        name: `${found.name} (2)`,
        isFavorite: false,
        launchCount: 0,
        lastLaunchedAt: null,
      };
      fixtureItems.push(copy);
      return copy;
    },
    toggle_favorite: (args) => {
      const found = fixtureItems.find((entry) => entry.id === args.itemId);
      return found ? { ...found, isFavorite: Boolean(args.favorite) } : undefined;
    },
    reorder_items: () => fixtureItems,
    import_paths: () => fixtureItems,
    import_discovery_candidates: () => fixtureItems,
  };

  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main", windowLabel: "main" },
    },
    invoke: (cmd: string, args?: unknown) => {
      const handler = handlers[cmd];
      if (handler) {
        return Promise.resolve(handler((args ?? {}) as Record<string, unknown>));
      }
      return Promise.reject(
        new Error(`[tauri-shim] "${cmd}" is unavailable outside the Tauri window`),
      );
    },
    transformCallback: (callback: (payload: unknown) => void) => {
      const id = ++nextCallbackId;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback: (id: number) => {
      callbacks.delete(id);
    },
    convertFileSrc: (filePath: string) => filePath,
  };

  console.info(
    "[deskrun] browser IPC shim active — read commands are served from dev fixtures; " +
      "launch, tray, and window control are inert",
  );
}
