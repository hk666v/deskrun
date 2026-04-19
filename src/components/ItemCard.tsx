import { Show, createEffect, createSignal } from "solid-js";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { LaunchItem } from "../types";
import { buildCommandPreview } from "../lib/command-preview";

const FALLBACK_LABEL: Record<LaunchItem["kind"], string> = {
  exe: "APP",
  link: "LNK",
  folder: "DIR",
  url: "WEB",
  command: "CMD",
};

interface ItemCardProps {
  item: LaunchItem;
  active: boolean;
  draggable: boolean;
  onClick: () => void;
  onSelect: () => void;
  onPreviewHover: (x: number, y: number) => void;
  onPreviewLeave: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

export function ItemCard(props: ItemCardProps) {
  const [iconLoadFailed, setIconLoadFailed] = createSignal(false);

  createEffect(() => {
    props.item.iconPath;
    props.item.id;
    setIconLoadFailed(false);
  });

  const iconSrc = () =>
    props.item.iconPath && !iconLoadFailed()
      ? convertFileSrc(props.item.iconPath)
      : null;

  const kindLabel = () => props.item.kind.toUpperCase();
  const targetLabel = () => (props.item.kind === "command" ? "Command" : "Target");
  const targetValue = () => {
    if (props.item.kind !== "command") {
      return props.item.target;
    }

    return buildCommandPreview(props.item);
  };
  const notePreview = () => props.item.note?.replace(/\s+/g, " ").trim() ?? "";
  const hasPreviewDetails = () => props.item.kind === "command" || notePreview().length > 0;

  return (
    <button
      type="button"
      draggable={props.draggable}
      onMouseEnter={(event) => {
        props.onSelect();
        if (hasPreviewDetails()) {
          props.onPreviewHover(event.clientX, event.clientY);
        }
      }}
      onMouseMove={(event) => {
        if (hasPreviewDetails()) {
          props.onPreviewHover(event.clientX, event.clientY);
        }
      }}
      onMouseLeave={props.onPreviewLeave}
      onFocus={props.onSelect}
      onClick={props.onClick}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onSelect();
        props.onContextMenu(event.clientX, event.clientY);
      }}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      class={`group relative grid min-h-[178px] min-w-0 w-full grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-[24px] border px-4 py-4 text-left transition duration-200 ${
        props.active
          ? "border-white/42 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] shadow-[0_14px_34px_rgba(9,18,34,0.2)]"
          : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))] hover:-translate-y-[1px] hover:border-white/24 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.07))]"
      }`}
    >
      <div class="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-start gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-white/14 bg-[linear-gradient(180deg,rgba(250,252,255,0.96),rgba(236,244,255,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_8px_18px_rgba(10,18,34,0.1)]">
          <Show
            when={iconSrc()}
            fallback={
              <span class="text-[10px] font-semibold tracking-[0.2em] text-slate-600">
                {FALLBACK_LABEL[props.item.kind]}
              </span>
            }
          >
            {(src) => (
              <img
                src={src()}
                alt={props.item.name}
                class="h-8 w-8 object-contain"
                onError={() => setIconLoadFailed(true)}
              />
            )}
          </Show>
        </div>

        <div class="flex min-h-12 min-w-0 flex-col items-start justify-center gap-2">
          <div class="min-w-0 self-stretch">
            <div
              class="overflow-hidden text-[15px] font-semibold leading-5 text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-all"
            >
              {props.item.name}
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <Show when={props.item.isFavorite}>
              <div
                class="flex h-6 items-center gap-1 rounded-full border border-amber-200/20 bg-amber-300/10 px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                title="Favorite"
                aria-label="Favorite"
              >
                <span class="h-2 w-2 rounded-full bg-amber-200/90" />
                <span class="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100/78">
                  Fav
                </span>
              </div>
            </Show>

            <div class="rounded-full border border-white/10 bg-black/12 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38">
              {kindLabel()}
            </div>
          </div>
        </div>
      </div>

      <div class="flex min-h-0 min-w-0 flex-col gap-2.5">
        <div class="min-w-0 max-w-full overflow-hidden rounded-[16px] border border-white/8 bg-black/12 px-3 py-2.5">
          <div class="mb-1 text-[9px] font-medium uppercase tracking-[0.16em] text-white/24">
            {targetLabel()}
          </div>
          <div
            class="block min-w-0 max-w-full truncate text-[11px] leading-4 text-white/56"
          >
            {targetValue()}
          </div>
        </div>

        <Show when={notePreview()}>
          <div class="min-w-0 max-w-full overflow-hidden rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-2">
            <div
              class="block min-w-0 max-w-full truncate text-[11px] leading-4 text-white/50"
            >
              {notePreview()}
            </div>
          </div>
        </Show>
      </div>
    </button>
  );
}
