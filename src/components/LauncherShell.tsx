import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal, onCleanup, onMount, type JSX } from "solid-js";

/// Matches the directions `startResizeDragging` accepts. The package declares
/// this union but does not export it, so it is repeated here.
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

interface LauncherShellProps {
  children: JSX.Element;
  dragging: boolean;
}

/**
 * The OS gives a transparent, undecorated window no shadow of its own, and a
 * box-shadow painted on a surface that fills the window would be clipped away.
 * So the visible panel is inset by a small gutter, which is transparent and
 * holds the shadow. When the window is dragged to fill the work area the gutter
 * would read as a seam against the screen edge, so it collapses.
 */
function useFlushToScreenEdge() {
  const [flush, setFlush] = createSignal(false);

  onMount(() => {
    const measure = () => {
      setFlush(
        window.innerWidth >= window.screen.availWidth - 4 &&
          window.innerHeight >= window.screen.availHeight - 4,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    onCleanup(() => window.removeEventListener("resize", measure));
  });

  return flush;
}

export function LauncherShell(props: LauncherShellProps) {
  const currentWindow = getCurrentWindow();
  const flush = useFlushToScreenEdge();

  const startDrag = async () => {
    await currentWindow.startDragging();
  };

  const startResize = async (direction: ResizeDirection) => {
    await currentWindow.startResizeDragging(direction);
  };

  return (
    <main
      tabIndex={0}
      class={`relative h-screen w-screen overflow-hidden bg-transparent text-fg outline-none ${
        flush() ? "p-0" : "p-1.5"
      }`}
    >
      <div
        class={`relative h-full w-full overflow-hidden ${
          flush() ? "" : "rounded-window bg-canvas shadow-float ring-1 ring-line"
        }`}
      >
        <div
          class="absolute top-5 right-5 left-5 z-chrome h-8 cursor-move select-none"
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            void startDrag();
          }}
        />

        <div class="relative h-full p-5">{props.children}</div>

        {props.dragging && (
          <div class="pointer-events-none absolute inset-0 z-scrim flex items-center justify-center rounded-window border border-dashed border-line-strong bg-surface/95 text-center">
            <div>
              <p class="text-title font-semibold">Drop files to add them</p>
              <p class="mt-2 text-label text-fg-muted">
                Supports `.exe`, `.lnk`, and folders
              </p>
            </div>
          </div>
        )}
      </div>

      {/* The visible panel is inset by the gutter, so a hit area measured from
          the window edge only overlaps a couple of pixels of what the user can
          actually see. These bands are deliberately generous — 16px on the
          edges, 20px at the corners — which still stops well short of any
          interactive content, since the panel has 20px of padding inside a 6px
          gutter. */}
      <ResizeHandle
        direction="North"
        class="top-0 right-5 left-5 h-4 cursor-n-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="South"
        class="right-5 bottom-0 left-5 h-4 cursor-s-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="West"
        class="top-5 bottom-5 left-0 w-4 cursor-w-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="East"
        class="top-5 right-0 bottom-5 w-4 cursor-e-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="NorthWest"
        class="top-0 left-0 h-5 w-5 cursor-nw-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="NorthEast"
        class="top-0 right-0 h-5 w-5 cursor-ne-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="SouthWest"
        class="bottom-0 left-0 h-5 w-5 cursor-sw-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="SouthEast"
        class="right-0 bottom-0 h-5 w-5 cursor-se-resize"
        onResize={startResize}
      />
    </main>
  );
}

interface ResizeHandleProps {
  class: string;
  direction: ResizeDirection;
  onResize: (direction: ResizeDirection) => Promise<void>;
}

function ResizeHandle(props: ResizeHandleProps) {
  return (
    <div
      class={`group absolute z-chrome select-none ${props.class}`}
      onMouseDown={(event) => {
        event.preventDefault();
        void props.onResize(props.direction);
      }}
    >
      {/* Without this the resize edges are invisible, so the only way to learn
          the window can be dragged is to guess. */}
      <div class="pointer-events-none absolute inset-0 bg-signal-soft opacity-0 transition-opacity duration-100 group-hover:opacity-100" />
    </div>
  );
}
