import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { Group } from "../types";

interface GroupTabsProps {
  groups: Group[];
  currentGroupId: string | null;
  discoveryCount: number;
  onSelect: (groupId: string | null) => void;
  onReorderGroups: (
    fromId: string,
    toId: string,
    placement: "before" | "after",
  ) => void | Promise<void>;
}

export function GroupTabs(props: GroupTabsProps) {
  const [dragGroupId, setDragGroupId] = createSignal<string | null>(null);
  const [dropTarget, setDropTarget] = createSignal<{
    groupId: string;
    placement: "before" | "after";
  } | null>(null);
  const [dragActive, setDragActive] = createSignal(false);
  let suppressClick = false;
  let pointerStart: { x: number; y: number } | null = null;
  const groupRefs = new Map<string, HTMLButtonElement>();

  const clearDragState = () => {
    setDragGroupId(null);
    setDropTarget(null);
    setDragActive(false);
    pointerStart = null;
  };

  onMount(() => {
    const resolveDropTarget = (x: number, y: number) => {
      for (const group of props.groups) {
        const element = groupRefs.get(group.id);
        if (!element) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const inside =
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom;
        if (inside) {
          return {
            groupId: group.id,
            placement: x < rect.left + rect.width / 2 ? "before" : "after",
          } as const;
        }
      }

      return null;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragGroupId() || !pointerStart) {
        return;
      }

      const deltaX = Math.abs(event.clientX - pointerStart.x);
      const deltaY = Math.abs(event.clientY - pointerStart.y);
      if (!dragActive() && (deltaX > 4 || deltaY > 4)) {
        setDragActive(true);
      }

      if (!dragActive() && !(deltaX > 4 || deltaY > 4)) {
        return;
      }

      const target = resolveDropTarget(event.clientX, event.clientY);
      setDropTarget(target && target.groupId !== dragGroupId() ? target : null);
    };

    const handleMouseUp = async (event: MouseEvent) => {
      const sourceId = dragGroupId();
      const target = resolveDropTarget(event.clientX, event.clientY);

      if (dragActive() && sourceId && target && target.groupId !== sourceId) {
        suppressClick = true;
        await props.onReorderGroups(sourceId, target.groupId, target.placement);
      }

      clearDragState();
    };

    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);

    onCleanup(() => {
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
    });
  });

  const systemTabClass = (active: boolean) =>
    active
      ? "border-white/10 bg-[#1C1F2A] text-white"
      : "border-transparent bg-transparent text-white/46 hover:bg-[#1C1F2A] hover:text-white/82";

  return (
    <div class="flex min-w-0 items-center gap-3 rounded-[22px] border border-white/8 bg-[#161820] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div class="min-w-0 flex-1 overflow-x-auto">
        <div class="flex w-max items-center gap-2 pr-1">
          <button
            type="button"
            onClick={() => props.onSelect(null)}
            class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${systemTabClass(
              props.currentGroupId === null,
            )}`}
          >
            My Library
          </button>
          <button
            type="button"
            onClick={() => props.onSelect("__favorites__")}
            class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${systemTabClass(
              props.currentGroupId === "__favorites__",
            )}`}
          >
            Favorites
          </button>
          <button
            type="button"
            onClick={() => props.onSelect("__recent__")}
            class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${systemTabClass(
              props.currentGroupId === "__recent__",
            )}`}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => props.onSelect("__discovery__")}
            class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${systemTabClass(
              props.currentGroupId === "__discovery__",
            )}`}
          >
            {props.discoveryCount > 0 ? `Discovery (${props.discoveryCount})` : "Discovery"}
          </button>

          <Show when={props.groups.length > 0}>
            <div class="mx-1 h-5 w-px shrink-0 bg-white/10" />
          </Show>

          <For each={props.groups}>
            {(group) => (
              <div class="relative shrink-0">
                <div
                  class={`pointer-events-none absolute bottom-1 top-1 w-[3px] rounded-full bg-sky-200/90 shadow-[0_0_0_1px_rgba(125,211,252,0.18),0_0_16px_rgba(56,189,248,0.28)] transition ${
                    dropTarget()?.groupId === group.id &&
                    dropTarget()?.placement === "before"
                      ? "left-[-7px] opacity-100"
                      : "left-[-11px] opacity-0"
                  }`}
                />
                <div
                  class={`pointer-events-none absolute bottom-1 top-1 w-[3px] rounded-full bg-sky-200/90 shadow-[0_0_0_1px_rgba(125,211,252,0.18),0_0_16px_rgba(56,189,248,0.28)] transition ${
                    dropTarget()?.groupId === group.id &&
                    dropTarget()?.placement === "after"
                      ? "right-[-7px] opacity-100"
                      : "right-[-11px] opacity-0"
                  }`}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    if (suppressClick) {
                      suppressClick = false;
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    props.onSelect(group.id);
                  }}
                  onMouseDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    pointerStart = { x: event.clientX, y: event.clientY };
                    setDragGroupId(group.id);
                    setDropTarget(null);
                    setDragActive(false);
                  }}
                  ref={(element) => {
                    groupRefs.set(group.id, element);
                  }}
                  class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium select-none transition ${
                    dragGroupId() === group.id && dragActive()
                      ? "cursor-grabbing border-sky-200/24 bg-[#1C1F2A] text-white shadow-[0_10px_24px_rgba(56,189,248,0.16)]"
                      : dropTarget()?.groupId === group.id
                        ? "cursor-grab border-sky-200/22 bg-[#1C1F2A] text-white shadow-[0_10px_24px_rgba(56,189,248,0.1)]"
                        : props.currentGroupId === group.id
                          ? "cursor-grab border-white/10 bg-[#1C1F2A] text-white"
                          : "cursor-grab border-transparent bg-transparent text-white/46 hover:bg-[#1C1F2A] hover:text-white/82"
                  }`}
                  title={group.name}
                >
                  {group.name}
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
