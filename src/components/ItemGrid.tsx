import { For, Show } from "solid-js";
import type { LaunchItem } from "../types";
import { ItemCard } from "./ItemCard";

interface ItemGridProps {
  items: LaunchItem[];
  viewMode: "grid" | "list";
  activeItemId: string | null;
  sortable: boolean;
  onLaunch: (item: LaunchItem) => void;
  onSelect: (item: LaunchItem) => void;
  onPreviewHover: (item: LaunchItem, x: number, y: number) => void;
  onPreviewLeave: () => void;
  onContextMenu: (item: LaunchItem, x: number, y: number) => void;
  onReorder: (fromId: string, toId: string) => void;
}

export function ItemGrid(props: ItemGridProps) {
  let draggedId: string | null = null;

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
      <Show
        when={props.items.length > 0}
        fallback={
          <div class="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-white/18 bg-black/10 text-center text-white/55">
            <p class="text-lg font-medium text-white/80">No launch items yet</p>
            <p class="max-w-sm text-sm leading-6">
              Add `.exe`, `.lnk`, folders, URLs, or CMD commands from the top bar,
              or drop files directly into the window.
            </p>
          </div>
        }
      >
        <div
          class={
            props.viewMode === "list"
              ? "flex min-h-0 flex-1 flex-col items-stretch gap-3 overflow-y-auto overscroll-contain pr-2"
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
          <For each={props.items}>
            {(item) => (
              <ItemCard
                item={item}
                layout={props.viewMode}
                active={item.id === props.activeItemId}
                draggable={props.sortable}
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
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
