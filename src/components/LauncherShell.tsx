import { getCurrentWindow, type ResizeDirection } from "@tauri-apps/api/window";
import { createSignal, onCleanup, onMount, type JSX } from "solid-js";

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
      onMouseDownCapture={(event) => {
        event.currentTarget.focus();
      }}
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

      <ResizeHandle
        direction="North"
        class="top-0 right-3 left-3 h-2 cursor-n-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="South"
        class="right-3 bottom-0 left-3 h-2 cursor-s-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="West"
        class="top-3 bottom-3 left-0 w-2 cursor-w-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="East"
        class="top-3 right-0 bottom-3 w-2 cursor-e-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="NorthWest"
        class="top-0 left-0 h-3 w-3 cursor-nw-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="NorthEast"
        class="top-0 right-0 h-3 w-3 cursor-ne-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="SouthWest"
        class="bottom-0 left-0 h-3 w-3 cursor-sw-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="SouthEast"
        class="right-0 bottom-0 h-3 w-3 cursor-se-resize"
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
      class={`absolute z-chrome select-none ${props.class}`}
      onMouseDown={(event) => {
        event.preventDefault();
        void props.onResize(props.direction);
      }}
    />
  );
}
