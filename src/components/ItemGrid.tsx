import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { LaunchItem } from "../types";
import type { QueryAction } from "../lib/query-actions";
import { ItemCard } from "./ItemCard";

interface ItemGridProps {
  items: LaunchItem[];
  viewMode: "grid" | "list";
  activeItemId: string | null;
  sortable: boolean;
  sectioned: boolean;
  query: string;
  viewId: string | null;
  /// Offered instead of a dead end when nothing matches the query.
  queryActions: QueryAction[];
  onLaunch: (item: LaunchItem) => void;
  onSelect: (item: LaunchItem) => void;
  onPreviewHover: (item: LaunchItem, x: number, y: number) => void;
  onPreviewLeave: () => void;
  onContextMenu: (item: LaunchItem, x: number, y: number) => void;
  onReorder: (fromId: string, toId: string) => void;
  onColumnsChange: (columns: number) => void;
  onRunQueryAction: (action: QueryAction) => void;
}

const QUERY_ACTION_TAG: Record<QueryAction["kind"], string> = {
  url: "URL",
  number: "NUM",
  web: "WEB",
};

type ItemSection = {
  id: "pinned" | "recent" | "unused";
  title: string;
  items: LaunchItem[];
};

export function ItemGrid(props: ItemGridProps) {
  const [draggedId, setDraggedId] = createSignal<string | null>(null);
  const [overId, setOverId] = createSignal<string | null>(null);
  let gridRef: HTMLDivElement | undefined;

  const sections = createMemo<ItemSection[]>(() => {
    const pinned = props.items.filter((item) => item.isFavorite);
    const recent = props.items.filter(
      (item) => !item.isFavorite && (item.launchCount > 0 || item.lastLaunchedAt !== null),
    );
    const unused = props.items.filter(
      (item) => !item.isFavorite && item.launchCount === 0 && item.lastLaunchedAt === null,
    );

    const all: ItemSection[] = [
      { id: "pinned", title: "Pinned", items: pinned },
      { id: "recent", title: "Recent", items: recent },
      { id: "unused", title: "Unused", items: unused },
    ];

    return all.filter((section) => section.items.length > 0);
  });

  // The keyboard's vertical step has to match whatever the CSS grid actually
  // resolved to, which depends on window width and on whether a scrollbar is
  // present. Measuring the used track list is the only reliable source.
  createEffect(() => {
    const element = gridRef;
    if (!element || props.viewMode !== "grid") {
      return;
    }

    const report = () => {
      const tracks = getComputedStyle(element).gridTemplateColumns
        .split(" ")
        .filter((track) => track.length > 0).length;
      props.onColumnsChange(Math.max(1, tracks));
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  const renderItem = (item: LaunchItem, subdued = false) => (
    <ItemCard
      item={item}
      layout={props.viewMode}
      active={item.id === props.activeItemId}
      draggable={props.sortable}
      subdued={subdued}
      dragState={
        draggedId() === item.id ? "dragging" : overId() === item.id ? "over" : undefined
      }
      onSelect={() => props.onSelect(item)}
      onPreviewHover={(x, y) => props.onPreviewHover(item, x, y)}
      onPreviewLeave={props.onPreviewLeave}
      onClick={() => props.onLaunch(item)}
      onContextMenu={(x, y) => props.onContextMenu(item, x, y)}
      onDragStart={(event) => {
        setDraggedId(item.id);
        event.dataTransfer?.setData("text/plain", item.id);
      }}
      onDragOver={(event) => {
        if (!props.sortable || draggedId() === null) {
          return;
        }
        event.preventDefault();
        setOverId(item.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const from = draggedId();
        if (props.sortable && from && from !== item.id) {
          props.onReorder(from, item.id);
        }
        setDraggedId(null);
        setOverId(null);
      }}
    />
  );

  const emptyState = () => {
    if (props.query.trim().length > 0) {
      return {
        title: "No matches",
        detail: `Nothing here matches “${props.query.trim()}”. Try a shorter term, or clear the search to see everything.`,
      };
    }

    if (props.viewId === "__favorites__") {
      return {
        title: "Nothing pinned yet",
        detail: "Right-click any item and choose Pin to keep it in this view.",
      };
    }

    if (props.viewId === "__recent__") {
      return {
        title: "Nothing launched yet",
        detail: "Items you run will appear here, most recent first.",
      };
    }

    return {
      title: "No launch items yet",
      detail:
        "Add `.exe`, `.lnk`, folders, URLs, or CMD commands from the top bar, or drop files directly into the window.",
    };
  };

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface p-3">
      <Show
        when={props.items.length > 0}
        fallback={
          <Show
            when={props.queryActions.length > 0}
            fallback={
              <div class="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-line text-center">
                <p class="text-title font-medium text-fg-muted">{emptyState().title}</p>
                <p class="max-w-sm text-label text-fg-subtle">{emptyState().detail}</p>
              </div>
            }
          >
            <div class="flex h-full min-h-[200px] flex-col items-center justify-center gap-3">
              <p class="text-label text-fg-subtle">
                Nothing in your library matches “{props.query.trim()}”
              </p>
              <div class="flex w-full max-w-md flex-col gap-1.5">
                <For each={props.queryActions}>
                  {(action, index) => (
                    <button
                      type="button"
                      onClick={() => props.onRunQueryAction(action)}
                      class={`grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border px-3 py-2 text-left transition-colors duration-100 ${
                        index() === 0
                          ? "border-signal-line bg-fill-strong"
                          : "border-line hover:bg-fill"
                      }`}
                    >
                      <span class="flex h-6 w-6 items-center justify-center rounded-sharp border border-line bg-inset font-mono text-micro text-fg-subtle">
                        {QUERY_ACTION_TAG[action.kind]}
                      </span>
                      <span class="min-w-0">
                        <span class="block truncate text-label font-medium text-fg">
                          {action.label}
                        </span>
                        <span class="block truncate text-meta text-fg-subtle">
                          {action.detail}
                        </span>
                      </span>
                      <Show when={index() === 0}>
                        <span class="shrink-0 font-mono text-micro text-fg-faint">
                          ENTER
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        }
      >
        <Show
          when={props.viewMode === "list" && props.sectioned}
          fallback={
            <div
              ref={gridRef}
              class={
                props.viewMode === "list"
                  ? "flex min-h-0 flex-1 flex-col items-stretch overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]"
                  : "grid min-h-0 flex-1 content-start items-stretch gap-2 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]"
              }
              style={
                props.viewMode === "grid"
                  ? {
                      "grid-template-columns": "repeat(auto-fill, minmax(200px, 1fr))",
                    }
                  : undefined
              }
            >
              <For each={props.items}>{(item) => renderItem(item)}</For>
            </div>
          }
        >
          <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
            <For each={sections()}>
              {(section) => (
                <section class="flex flex-col gap-2">
                  <div class="flex items-center gap-3 px-1">
                    <div class="text-meta font-medium text-fg-muted">{section.title}</div>
                    <div class="h-px flex-1 bg-line" />
                  </div>
                  <div class="flex flex-col">
                    <For each={section.items}>
                      {(item) => renderItem(item, section.id === "unused")}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
