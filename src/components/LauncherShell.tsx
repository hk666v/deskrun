import { getCurrentWindow, type ResizeDirection } from "@tauri-apps/api/window";
import type { JSX } from "solid-js";

interface LauncherShellProps {
  children: JSX.Element;
  dragging: boolean;
}

export function LauncherShell(props: LauncherShellProps) {
  const currentWindow = getCurrentWindow();

  const startResize = async (direction: ResizeDirection) => {
    await currentWindow.startResizeDragging(direction);
  };

  return (
    <main
      tabIndex={-1}
      class="relative h-screen overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#121a27,#161f2d)] p-5 text-white outline-none"
    >
      <div class="relative h-full">{props.children}</div>

      <ResizeHandle
        direction="North"
        class="left-6 right-6 top-0 h-2 cursor-n-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="South"
        class="bottom-0 left-6 right-6 h-2 cursor-s-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="West"
        class="bottom-6 left-0 top-6 w-2 cursor-w-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="East"
        class="bottom-6 right-0 top-6 w-2 cursor-e-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="NorthWest"
        class="left-0 top-0 h-5 w-5 cursor-nw-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="NorthEast"
        class="right-0 top-0 h-5 w-5 cursor-ne-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="SouthWest"
        class="bottom-0 left-0 h-5 w-5 cursor-sw-resize"
        onResize={startResize}
      />
      <ResizeHandle
        direction="SouthEast"
        class="bottom-0 right-0 h-5 w-5 cursor-se-resize"
        onResize={startResize}
      />

      {props.dragging && (
        <div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[32px] border border-dashed border-white/34 bg-sky-100/8 text-center text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] backdrop-blur-md">
          <div>
            <p class="text-xl font-semibold">Drop files to add them</p>
            <p class="mt-2 text-sm text-white/55">
              Supports `.exe`, `.lnk`, and folders
            </p>
          </div>
        </div>
      )}
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
      class={`absolute z-30 select-none ${props.class}`}
      onMouseDown={(event) => {
        event.preventDefault();
        void props.onResize(props.direction);
      }}
    />
  );
}
