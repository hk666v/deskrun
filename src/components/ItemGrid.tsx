import { For, Show, createMemo } from "solid-js";
import type { LaunchItem } from "../types";
import { ItemCard } from "./ItemCard";

interface ItemGridProps {
  items: LaunchItem[];
  viewMode: "grid" | "list";
  activeItemId: string | null;
  sortable: boolean;
  sectioned: boolean;
  onLaunch: (item: LaunchItem) => void;
  onSelect: (item: LaunchItem) => void;
  onPreviewHover: (item: LaunchItem, x: number, y: number) => void;
  onPreviewLeave: () => void;
  onContextMenu: (item: LaunchItem, x: number, y: number) => void;
  onReorder: (fromId: string, toId: string) => void;
}

type ItemSection = {
  id: "pinned" | "recent" | "unused";
  title: string;
  items: LaunchItem[];
};

export function ItemGrid(props: ItemGridProps) {
  let draggedId: string | null = null;

  const sections = createMemo<ItemSection[]>(() => {
    const pinned = props.items.filter((item) => item.isFavorite);
    const recent = props.items.filter(
      (item) => !item.isFavorite && (item.launchCount > 0 || item.lastLaunchedAt !== null),
    );
    const unused = props.items.filter(
      (item) => !item.isFavorite && item.launchCount === 0 && item.lastLaunchedAt === null,
    );

    return [
      { id: "pinned", title: "Pinned", items: pinned },
      { id: "recent", title: "Recent", items: recent },
      { id: "unused", title: "Unused", items: unused },
    ].filter((section) => section.items.length > 0);
  });

  const renderItem = (item: LaunchItem, subdued = false) => (
    <ItemCard
      item={item}
      layout={props.viewMode}
      active={item.id === props.activeItemId}
      draggable={props.sortable}
      subdued={subdued}
      onSelect={() => props.onSelect(item)}
      onPreviewHover={(x, y) => props.onPreviewHover(item, x, y)}
      onPreviewLeave={props.onPreviewLeave}
      onClick={() => props.onLaunch(item)}
      onContextMenu={(x, y) => props.onContextMenu(item, x, y)}
      onDragStart={(event) => {
        draggedId = item.id;
        event.dataTransfer?.setData("text/plain", item.id);
      }}
      onDragOver={(event) => {
        if (props.sortable) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (props.sortable && draggedId && draggedId !== item.id) {
          props.onReorder(draggedId, item.id);
        }
        draggedId = null;
      }}
    />
  );

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-white/8 bg-[#161820] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <Show
        when={props.items.length > 0}
        fallback={
          <div class="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-white/10 bg-[#0F1117] text-center text-white/55">
            <p class="text-lg font-medium text-white/80">No launch items yet</p>
            <p class="max-w-sm text-sm leading-6">
              Add `.exe`, `.lnk`, folders, URLs, or CMD commands from the top bar,
              or drop files directly into the window.
            </p>
          </div>
        }
      >
        <Show
          when={props.viewMode === "list" && props.sectioned}
          fallback={
            <div
              class={
                props.viewMode === "list"
                  ? "flex min-h-0 flex-1 flex-col items-stretch gap-2 overflow-y-auto overscroll-contain pr-2"
                  : "grid min-h-0 flex-1 content-start items-stretch gap-4 overflow-y-auto overscroll-contain pr-2"
              }
              style={
                props.viewMode === "grid"
                  ? {
                      "grid-template-columns": "repeat(auto-fill, minmax(208px, 1fr))",
                    }
                  : undefined
              }
            >
              <For each={props.items}>{renderItem}</For>
            </div>
          }
        >
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-2">
            <For each={sections()}>
              {(section) => (
                <section class="flex flex-col gap-2.5">
                  <div class="flex items-center gap-3 px-1">
                    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      {section.title}
                    </div>
                    <div class="h-px flex-1 bg-white/10" />
                  </div>
                  <div class="flex flex-col gap-2">
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
