import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { LaunchItem } from "../types";
import { buildCommandPreview } from "../lib/command-preview";
import { compactPath } from "../lib/paths";
import { splitOnMatch } from "../lib/highlight";
import { loadIcon } from "../lib/icon-cache";

const FALLBACK_LABEL: Record<LaunchItem["kind"], string> = {
  exe: "EXE",
  link: "LNK",
  folder: "DIR",
  url: "URL",
  command: "CMD",
};

/// The kind's color, as something the tile mixes down. It stays out of the
/// class list because the mix is per kind and a class cannot carry it.
const KIND_TINT: Record<LaunchItem["kind"], string> = {
  exe: "var(--color-kind-exe)",
  link: "var(--color-kind-link)",
  folder: "var(--color-kind-folder)",
  url: "var(--color-kind-url)",
  command: "var(--color-kind-command)",
};

interface ItemCardProps {
  item: LaunchItem;
  layout: "grid" | "list";
  active: boolean;
  draggable: boolean;
  subdued?: boolean;
  /** Set while an in-app reorder drag is in flight. */
  dragState?: "dragging" | "over";
  /// The current search term, so a result can show why it matched.
  query: string;
  /// Whether the arrow keys are working in this pane. The selection is drawn at
  /// full strength here when they are, and quietly when they are in the column
  /// beside it — that difference is the only thing on screen saying where up and
  /// down will go.
  live: boolean;
  /// The branch path of the group this item is filed in, when that is worth
  /// saying — the view it is being shown in is not that group.
  groupLabel?: string;
  /// Position in the list. It is what staggers the arrival animation, capped so
  /// a long list is never still arriving once the user is typing.
  index: number;
  onClick: () => void;
  onSelect: () => void;
  onPreviewHover: (x: number, y: number) => void;
  onPreviewLeave: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

/// Text with the parts the query matched marked. Highlighting the match is what
/// keeps a pinyin or substring hit from looking like a bug.
///
/// The amber wash is the one accent used outside selection: a search match is a
/// selection of the text, and without it a hit is indistinguishable from noise.
function Highlighted(props: { text: string; query: string }) {
  const segments = createMemo(() => splitOnMatch(props.text, props.query));

  return (
    <For each={segments()}>
      {(segment) =>
        segment.match ? (
          <mark class="bg-signal-soft text-fg">{segment.text}</mark>
        ) : (
          <>{segment.text}</>
        )
      }
    </For>
  );
}

export function ItemCard(props: ItemCardProps) {
  const [iconSrc, setIconSrc] = createSignal<string | null>(null);
  let buttonRef: HTMLButtonElement | undefined;

  // Icons come back from the backend as data URLs and are memoised per path, so
  // re-rendering a card does not re-read the file.
  createEffect(() => {
    const iconPath = props.item.iconPath;
    setIconSrc(null);
    if (!iconPath) {
      return;
    }

    let cancelled = false;
    void loadIcon(iconPath).then((dataUrl) => {
      if (!cancelled) {
        setIconSrc(dataUrl);
      }
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  // Arrow keys move the selection but nothing scrolled the list, so the
  // highlight could walk off-screen while the user kept pressing them.
  createEffect(() => {
    if (props.active) {
      buttonRef?.scrollIntoView({ block: "nearest" });
    }
  });

  const targetValue = () => {
    if (props.item.kind !== "command") {
      return props.item.target;
    }

    return buildCommandPreview(props.item);
  };

  const notePreview = () => props.item.note?.replace(/\s+/g, " ").trim() ?? "";
  /// Six rows is as far as the cascade runs: past that the delay would be
  /// longer than the animation, and the list would arrive after the typing.
  const rowDelay = () => `${Math.min(props.index, 6) * 12}ms`;
  const hasNote = () => notePreview().length > 0;
  const hasPreviewDetails = () => props.item.kind === "command" || hasNote();
  const compactTargetValue = () => targetValue().replace(/\s+/g, " ").trim();
  const listTargetValue = () => {
    const value = compactTargetValue();

    // A command or a URL is the content itself, not a path to shorten.
    if (props.item.kind === "command" || props.item.kind === "url") {
      return value;
    }

    return compactPath(value);
  };

  const stateClass = () => (props.dragState === "dragging" ? "opacity-40" : "");

  /// A row in the Unused section goes one step quieter on each line rather than
  /// the whole row being faded. Whole-row opacity takes the note line — already
  /// the faintest text — below the point where it can be read at all, and dims
  /// the icon's kind colour along with it.
  const toned = (resting: string, subdued: string) => (props.subdued ? subdued : resting);

  // Preview positioning rides on mousemove; selection is keyboard and focus only,
  // so hovering never steals the keyboard cursor out from under the user.
  const trackPreview = (event: MouseEvent) => {
    if (hasPreviewDetails()) {
      props.onPreviewHover(event.clientX, event.clientY);
    }
  };

  /// The group this item is filed in. Quiet, and only present when the view it
  /// is being shown in is not that group: it answers a question the row is not
  /// otherwise about.
  const groupChip = () => (
    <Show when={props.groupLabel}>
      {(label) => (
        <span
          class={`max-w-[140px] shrink-0 truncate rounded-sharp border border-line px-1.5 text-micro ${
            props.subdued ? "text-fg-faint" : "text-fg-subtle"
          }`}
          title={label()}
        >
          {label()}
        </span>
      )}
    </Show>
  );

  const overlays = () => (
    <>
      {/* Under the content, so the light passes beneath the text instead of
          washing it out. */}
      <div class="pointer-events-none absolute inset-0 opacity-0 spotlight transition-opacity duration-150 group-hover:opacity-100" />

      <Show when={props.active}>
        {/* Positioned, not merely a wrapper: the card is a grid, and a plain
            div here would be laid out as one of its items and push the rest
            along. */}
        <div class={`pointer-events-none absolute inset-0 ${props.live ? "" : "opacity-40"}`}>
          {/* A row is wide and flat, so the accent is spent as a wash that fades
              out to the right instead of a flat tint: the row still reads as part
              of the list, and the eye is pulled to the edge the mark is on. A
              card is a box, so there it is the border and the lift that carry the
              selection. */}
          <Show when={props.layout === "list"}>
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-signal-soft to-transparent" />
          </Show>
          <div class="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-signal to-signal-hot shadow-[0_0_14px_var(--color-signal-glow)]" />
        </div>
      </Show>
      <Show when={props.dragState === "over"}>
        <div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-signal to-signal-hot" />
      </Show>
    </>
  );

  const iconTile = (size: "grid" | "list") => (
    <div
      class={`flex shrink-0 items-center justify-center overflow-hidden rounded-sharp border surface-transition group-hover:scale-105 group-hover:shadow-[0_0_18px_-6px_var(--color-signal-glow)] ${
        props.subdued ? "opacity-60 group-hover:opacity-100" : ""
      } ${size === "grid" ? "h-11 w-11" : "h-9 w-9 self-start"}`}
      style={{
        "border-color": `color-mix(in srgb, ${KIND_TINT[props.item.kind]} 42%, transparent)`,
        "background-image": `radial-gradient(circle at 50% 118%, color-mix(in srgb, ${KIND_TINT[props.item.kind]} 24%, transparent), transparent 70%), linear-gradient(to bottom, var(--color-fill), var(--color-inset))`,
      }}
    >
      <Show
        when={iconSrc()}
        fallback={
          <span
            class="font-mono text-micro"
            style={{ color: KIND_TINT[props.item.kind] }}
          >
            {FALLBACK_LABEL[props.item.kind]}
          </span>
        }
      >
        {(src) => (
          <img
            src={src()}
            alt={props.item.name}
            class={size === "grid" ? "h-7 w-7 object-contain" : "h-6 w-6 object-contain"}
          />
        )}
      </Show>
    </div>
  );

  return (
    <Show
      when={props.layout === "list"}
      fallback={
        <button
          type="button"
          ref={buttonRef}
          draggable={props.draggable}
          onMouseEnter={trackPreview}
          onMouseMove={(event) => {
            trackSpotlight(event.currentTarget, event.clientX, event.clientY);
            trackPreview(event);
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
          data-item-id={props.item.id}
          aria-haspopup="menu"
          class={`group relative grid min-h-[124px] w-full min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-sharp border bg-raised px-3 py-3 text-left surface-transition hover:-translate-y-0.5 ${
            props.active
              ? props.live
                ? "border-signal-line shadow-select hover:bg-raised-hover"
                : "border-[color-mix(in_srgb,var(--color-signal-line)_45%,transparent)] hover:bg-raised-hover"
              : "border-line hover:border-line-strong hover:bg-raised-hover"
          } ${stateClass()}`}
          style={{ "--row-delay": rowDelay() }}
        >
          {overlays()}

          <div class="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-start gap-3">
            {iconTile("grid")}

            <div class="flex min-h-11 min-w-0 flex-col items-start justify-center gap-2">
              <div class="min-w-0 self-stretch">
                <div class="overflow-hidden text-body font-medium text-fg transition-colors group-hover:text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-all">
                  <Highlighted text={props.item.name} query={props.query} />
                </div>
              </div>
              {groupChip()}
            </div>
          </div>

          <div class="flex min-h-0 min-w-0 flex-col gap-1.5 border-l border-line pl-2">
            <div class="block min-w-0 max-w-full truncate font-mono text-data text-fg-subtle transition-colors group-hover:text-fg-muted">
              <Highlighted text={targetValue()} query={props.query} />
            </div>

            <Show when={notePreview()}>
              <div class="block min-w-0 max-w-full truncate text-meta text-fg-faint transition-colors group-hover:text-fg-subtle">
                <Highlighted text={notePreview()} query={props.query} />
              </div>
            </Show>
          </div>
        </button>
      }
    >
      <button
        type="button"
        ref={buttonRef}
        draggable={props.draggable}
        onMouseEnter={trackPreview}
        onMouseMove={(event) => {
          trackSpotlight(event.currentTarget, event.clientX, event.clientY);
          trackPreview(event);
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
        data-item-id={props.item.id}
        aria-haspopup="menu"
        class={`group relative grid w-full min-w-0 grid-cols-[36px_minmax(0,1fr)_72px] items-stretch gap-3 row-rule border-b px-2 py-2 text-left surface-transition last:border-b-0 ${
          hasNote() ? "min-h-[72px]" : "min-h-[56px]"
        } ${props.active ? "bg-fill-strong" : "hover:bg-fill"} ${stateClass()}`}
        style={{ "--row-delay": rowDelay() }}
      >
        {overlays()}

        {iconTile("list")}

        <div class="min-w-0 self-stretch">
          <div
            class={`h-full min-w-0 ${
              hasNote()
                ? "grid grid-rows-[auto_auto_auto] content-start gap-0.5"
                : "grid grid-rows-[auto_auto] content-start gap-0.5"
            }`}
          >
            <div class="flex min-w-0 items-center gap-2">
              <div
                class={`truncate text-body font-medium transition-colors group-hover:text-white ${toned(
                  "text-fg",
                  "text-fg-muted",
                )}`}
              >
                <Highlighted text={props.item.name} query={props.query} />
              </div>
              <Show when={props.item.isFavorite}>
                <span class="sr-only">Pinned</span>
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
              </Show>
              {groupChip()}
            </div>

            <div
              class={`truncate font-mono text-data transition-colors group-hover:text-fg-muted ${toned(
                "text-fg-subtle",
                "text-fg-faint",
              )}`}
            >
              <Highlighted text={listTargetValue()} query={props.query} />
            </div>

            <Show when={hasNote()}>
              <div class="truncate text-meta text-fg-faint transition-colors group-hover:text-fg-subtle">
                <Highlighted text={notePreview()} query={props.query} />
              </div>
            </Show>
          </div>
        </div>

        <div
          class={`flex h-full min-w-0 flex-col items-end text-right ${
            hasNote() ? "justify-between" : "justify-center gap-1"
          }`}
        >
          <div
            class={`font-mono text-meta transition-colors group-hover:text-fg-muted ${toned(
              "text-fg-subtle",
              "text-fg-faint",
            )}`}
          >
            {launchCountLabel(props.item.launchCount)}
          </div>
          <div class="font-mono text-meta text-fg-faint transition-colors group-hover:text-fg-subtle">
            {formatLaunchTimestamp(props.item.lastLaunchedAt)}
          </div>
        </div>
      </button>
    </Show>
  );
}

function launchCountLabel(count: number) {
  return count > 0 ? `↑ ${count}` : "—";
}

/// Writes the pointer's position into the card so the spotlight gradient has
/// something to read. Custom properties only: nothing re-renders, and the one
/// layout read is served from the browser's cache between writes.
function trackSpotlight(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--spot-x", `${clientX - rect.left}px`);
  element.style.setProperty("--spot-y", `${clientY - rect.top}px`);
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
