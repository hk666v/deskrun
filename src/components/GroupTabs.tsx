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

  // Selection is carried by a signal underline so it stays distinct from the
  // neutral hover wash used everywhere else.
  const tabClass = (active: boolean) =>
    `relative shrink-0 truncate rounded-sharp px-2 pt-1 pb-2 text-label transition-colors duration-100 ${
      active ? "text-fg" : "text-fg-subtle hover:bg-fill hover:text-fg-muted"
    }`;

  const activeUnderline = (active: boolean) => (
    <Show when={active}>
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-signal" />
    </Show>
  );

  const systemTabs: Array<{ id: string | null; label: string }> = [
    { id: null, label: "My Library" },
    { id: "__favorites__", label: "Favorites" },
    { id: "__recent__", label: "Recent" },
    {
      id: "__discovery__",
      label:
        props.discoveryCount > 0 ? `Discovery (${props.discoveryCount})` : "Discovery",
    },
  ];

  return (
    <div class="flex min-w-0 items-center border-b border-line">
      <div class="min-w-0 flex-1 overflow-x-auto">
        <div class="flex w-max items-center gap-1">
          <For each={systemTabs}>
            {(tab) => (
              <button
                type="button"
                onClick={() => props.onSelect(tab.id)}
                class={`max-w-[180px] ${tabClass(props.currentGroupId === tab.id)}`}
              >
                {tab.label}
                {activeUnderline(props.currentGroupId === tab.id)}
              </button>
            )}
          </For>

          <Show when={props.groups.length > 0}>
            <div class="mx-2 h-4 w-px shrink-0 bg-line" />
          </Show>

          <For each={props.groups}>
            {(group) => (
              <div class="relative shrink-0">
                <div
                  class={`pointer-events-none absolute top-0 bottom-0 w-[2px] bg-signal transition ${
                    dropTarget()?.groupId === group.id &&
                    dropTarget()?.placement === "before"
                      ? "left-[-5px] opacity-100"
                      : "left-[-9px] opacity-0"
                  }`}
                />
                <div
                  class={`pointer-events-none absolute top-0 bottom-0 w-[2px] bg-signal transition ${
                    dropTarget()?.groupId === group.id &&
                    dropTarget()?.placement === "after"
                      ? "right-[-5px] opacity-100"
                      : "right-[-9px] opacity-0"
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
                  class={`max-w-[180px] select-none ${tabClass(
                    props.currentGroupId === group.id,
                  )} ${
                    dragGroupId() === group.id && dragActive() ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  title={group.name}
                >
                  {group.name}
                  {activeUnderline(props.currentGroupId === group.id)}
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
