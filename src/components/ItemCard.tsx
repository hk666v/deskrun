import { Show, createEffect, createSignal } from "solid-js";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { LaunchItem } from "../types";

const FALLBACK_LABEL: Record<LaunchItem["kind"], string> = {
  exe: "APP",
  link: "LNK",
  folder: "DIR",
  url: "WEB",
};

interface ItemCardProps {
  item: LaunchItem;
  active: boolean;
  draggable: boolean;
  onClick: () => void;
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

  return (
    <button
      type="button"
      draggable={props.draggable}
      onClick={props.onClick}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onContextMenu(event.clientX, event.clientY);
      }}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      class={`group relative grid min-h-[146px] min-w-0 w-full grid-rows-[auto_auto_auto] gap-3 self-start overflow-hidden rounded-[24px] border px-4 py-4 text-left transition duration-200 ${
        props.active
          ? "border-white/42 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] shadow-[0_14px_34px_rgba(9,18,34,0.2)]"
          : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))] hover:-translate-y-[1px] hover:border-white/24 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.07))]"
      }`}
    >
      <div class="flex min-w-0 items-start gap-3">
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

        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="truncate text-[15px] font-semibold leading-5 text-white" title={props.item.name}>
                {props.item.name}
              </div>
              <div class="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/30">
                Quick Launch
              </div>
            </div>
            <div class="shrink-0 rounded-full border border-white/10 bg-black/12 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38">
              {kindLabel()}
            </div>
          </div>
        </div>
      </div>

      <div class="min-w-0 rounded-[16px] border border-white/8 bg-black/12 px-3 py-2.5">
        <div class="mb-1 text-[9px] font-medium uppercase tracking-[0.16em] text-white/24">
          Target
        </div>
        <div class="truncate text-[11px] leading-4 text-white/56" title={props.item.target}>
            {props.item.target}
        </div>
      </div>

      <div class="flex items-center justify-between">
        <span class="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/34">
          {props.active ? "Selected" : "Ready"}
        </span>
        <span class="text-[10px] text-white/22">Menu</span>
      </div>
    </button>
  );
}
