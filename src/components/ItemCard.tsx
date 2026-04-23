import { Show, createEffect, createSignal } from "solid-js";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { LaunchItem } from "../types";
import { buildCommandPreview } from "../lib/command-preview";

const FALLBACK_LABEL: Record<LaunchItem["kind"], string> = {
  exe: "APP",
  link: "LNK",
  folder: "DIR",
  url: "URL",
  command: "CMD",
};

interface ItemVisualTheme {
  iconClass: string;
  fallbackTextClass: string;
}

interface ItemCardProps {
  item: LaunchItem;
  layout: "grid" | "list";
  active: boolean;
  draggable: boolean;
  subdued?: boolean;
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

  const targetValue = () => {
    if (props.item.kind !== "command") {
      return props.item.target;
    }

    return buildCommandPreview(props.item);
  };

  const notePreview = () => props.item.note?.replace(/\s+/g, " ").trim() ?? "";
  const hasNote = () => notePreview().length > 0;
  const hasPreviewDetails = () => props.item.kind === "command" || hasNote();
  const compactTargetValue = () => targetValue().replace(/\s+/g, " ").trim();
  const listTargetValue = () => {
    const value = compactTargetValue();

    if (props.item.kind === "command" || props.item.kind === "url") {
      return value;
    }

    const normalized = value.replace(/\//g, "\\");
    const segments = normalized.split("\\").filter(Boolean);
    if (segments.length <= 3 || normalized.length <= 58) {
      return value;
    }

    const drive = normalized.match(/^[A-Za-z]:/)?.[0];
    const tail = segments.slice(-2).join("\\");
    return drive ? `${drive}\\...\\${tail}` : `...\\${tail}`;
  };

  const visualTheme = () => resolveItemVisualTheme(props.item);
  const subduedClass = () => (props.subdued ? "opacity-55 hover:opacity-100 focus-visible:opacity-100" : "");
  const launchCountLabel = () => `↑ ${props.item.launchCount}`;
  const launchCountClass = () =>
    props.item.launchCount > 0
      ? "text-emerald-300/88 group-hover:text-emerald-200"
      : "text-white/34 group-hover:text-white/42";
  const launchTimeClass = () =>
    props.item.launchCount > 0
      ? "text-emerald-100/58 group-hover:text-emerald-100/72"
      : "text-white/26 group-hover:text-white/34";

  return (
    <Show
      when={props.layout === "list"}
      fallback={
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
          class={`group relative grid min-h-[178px] min-w-0 w-full grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-[24px] border border-white/8 bg-[#161820] px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition duration-200 ${
            props.active ? "bg-[#1C1F2A]" : "hover:bg-[#1C1F2A]"
          } ${subduedClass()}`}
        >
          <div class="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-start gap-3">
            <div class={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${visualTheme().iconClass}`}>
              <Show
                when={iconSrc()}
                fallback={
                  <span class={`text-[10px] font-semibold tracking-[0.2em] ${visualTheme().fallbackTextClass}`}>
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
                <div class="overflow-hidden text-[15px] font-semibold leading-5 text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-all">
                  {props.item.name}
                </div>
              </div>
            </div>
          </div>

          <div class="flex min-h-0 min-w-0 flex-col gap-2.5">
            <div class="min-w-0 max-w-full overflow-hidden rounded-[16px] border border-white/8 bg-[#0F1117] px-3 py-2.5">
              <div class="block min-w-0 max-w-full truncate font-mono text-[11px] leading-4 text-white/52">
                {targetValue()}
              </div>
            </div>

            <Show when={notePreview()}>
              <div class="min-w-0 max-w-full overflow-hidden rounded-[16px] border border-white/8 bg-[#0F1117] px-3 py-2">
                <div class="block min-w-0 max-w-full truncate text-[11px] leading-4 text-white/48">
                  {notePreview()}
                </div>
              </div>
            </Show>
          </div>
        </button>
      }
    >
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
        class={`group relative grid w-full min-w-0 grid-cols-[42px_minmax(0,1fr)_72px] items-stretch gap-3 overflow-hidden rounded-[18px] border border-white/8 bg-[#161820] px-3.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition duration-200 ${
          hasNote() ? "min-h-[92px]" : "min-h-[76px]"
        } ${
          props.active ? "bg-[#1C1F2A]" : "hover:bg-[#1C1F2A]"
        } ${subduedClass()}`}
      >
        <Show when={props.item.isFavorite}>
          <div class="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-amber-300/88" />
        </Show>

        <div class={`mt-0.5 flex h-10 w-10 shrink-0 self-start items-center justify-center overflow-hidden rounded-[13px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${visualTheme().iconClass}`}>
          <Show
            when={iconSrc()}
            fallback={
              <span class={`text-[9px] font-semibold tracking-[0.16em] ${visualTheme().fallbackTextClass}`}>
                {FALLBACK_LABEL[props.item.kind]}
              </span>
            }
          >
            {(src) => (
              <img
                src={src()}
                alt={props.item.name}
                class="h-[22px] w-[22px] object-contain"
                onError={() => setIconLoadFailed(true)}
              />
            )}
          </Show>
        </div>

        <div class="min-w-0 self-stretch py-0.5">
          <div
            class={`h-full min-w-0 ${
              hasNote()
                ? "grid grid-rows-[auto_auto_auto] content-start gap-1"
                : "grid grid-rows-[auto_auto] content-start gap-1"
            }`}
          >
            <div class="flex min-w-0 items-center gap-2">
              <div class="truncate text-[14px] font-medium leading-5 text-white/96 transition group-hover:text-white">
                {props.item.name}
              </div>
              <Show when={props.item.isFavorite}>
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" title="Pinned" aria-label="Pinned" />
              </Show>
            </div>

            <div class="truncate whitespace-nowrap font-mono text-[12px] leading-[18px] text-white/52 transition group-hover:text-white/62">
              {listTargetValue()}
            </div>

            <Show when={hasNote()}>
              <div class="truncate whitespace-nowrap text-[12px] leading-[18px] text-slate-200/44 transition group-hover:text-slate-100/56">
                {notePreview()}
              </div>
            </Show>
          </div>
        </div>

        <div
          class={`flex h-full min-w-0 flex-col items-end py-0.5 text-right ${
            hasNote() ? "justify-between" : "justify-center gap-1.5"
          }`}
        >
          <div class={`text-[12px] font-medium leading-4 transition ${launchCountClass()}`}>
            {launchCountLabel()}
          </div>
          <div class={`font-mono text-[11px] leading-4 transition ${launchTimeClass()}`}>
            {formatLaunchTimestamp(props.item.lastLaunchedAt)}
          </div>
        </div>
      </button>
    </Show>
  );
}

function formatLaunchTimestamp(value: string | null) {
  if (!value) {
    return "--/-- --:--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--/-- --:--";
  }

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

function resolveItemVisualTheme(item: LaunchItem): ItemVisualTheme {
  switch (item.kind) {
    case "exe":
      return {
        iconClass: "border-[#1A417A] bg-[#0D1E35] text-[#2563EB]",
        fallbackTextClass: "text-[#60A5FA]",
      };
    case "command":
      return {
        iconClass: "border-[#175631] bg-[#0B2415] text-[#16A34A]",
        fallbackTextClass: "text-[#4ADE80]",
      };
    case "link":
      return {
        iconClass: "border-[#694013] bg-[#2A1A07] text-[#D97706]",
        fallbackTextClass: "text-[#FBBF24]",
      };
    case "folder":
      return {
        iconClass: "border-[#715122] bg-[#31210C] text-[#D97706]",
        fallbackTextClass: "text-[#FCD34D]",
      };
    case "url":
      return {
        iconClass: "border-[#5730A3] bg-[#1A1236] text-[#7C3AED]",
        fallbackTextClass: "text-[#A78BFA]",
      };
    default:
      return {
        iconClass: "border-[#1A417A] bg-[#0D1E35] text-[#2563EB]",
        fallbackTextClass: "text-[#60A5FA]",
      };
  }
}
