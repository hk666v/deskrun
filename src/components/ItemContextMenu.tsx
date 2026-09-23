import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import type { LaunchItem } from "../types";
import { itemLocation } from "../lib/location";

interface ItemContextMenuProps {
  item: LaunchItem | null;
  open: boolean;
  x: number;
  y: number;
  onLaunch: (item: LaunchItem) => void;
  onLaunchAsAdmin: (item: LaunchItem) => void;
  onToggleFavorite: (item: LaunchItem) => void;
  onDuplicate: (item: LaunchItem) => void;
  onCopyCommand: (item: LaunchItem) => void;
  onRevealLocation: (item: LaunchItem) => void;
  onEdit: (item: LaunchItem) => void;
  onDelete: (item: LaunchItem) => void;
  onClose: () => void;
}

interface MenuEntry {
  key: string;
  label: string;
  danger?: boolean;
  /// Draws a rule above this entry, splitting the menu into groups.
  dividerBefore?: boolean;
  run: () => void;
}

const menuItemId = (key: string) => `context-menu-${key}`;

export function ItemContextMenu(props: ItemContextMenuProps) {
  const [menuSize, setMenuSize] = createSignal({ width: 180, height: 220 });
  const [highlight, setHighlight] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  /// The menu is described as data rather than written out as markup so the
  /// arrow keys have an ordered list to walk. Only the entry set depends on the
  /// item, so it is built once per item rather than per render.
  const entries = createMemo<MenuEntry[]>(() => {
    const target = props.item;
    if (!target) {
      return [];
    }

    const list: MenuEntry[] = [];
    const add = (entry: MenuEntry, dividerBefore = false) =>
      list.push({ ...entry, dividerBefore });

    // Use it, organize it, work with what it points at, change it, destroy it.
    add({ key: "launch", label: "Launch", run: () => props.onLaunch(target) });
    // Elevating a browser is meaningless, so it is not offered.
    if (target.kind !== "url") {
      add({
        key: "admin",
        label: "Run as administrator",
        run: () => props.onLaunchAsAdmin(target),
      });
    }

    add(
      {
        key: "pin",
        label: target.isFavorite ? "Unpin" : "Pin",
        run: () => props.onToggleFavorite(target),
      },
      true,
    );
    add({ key: "duplicate", label: "Duplicate", run: () => props.onDuplicate(target) });

    const work: MenuEntry[] = [];
    if (target.kind === "command") {
      work.push({
        key: "copy",
        label: "Copy Command",
        run: () => props.onCopyCommand(target),
      });
    }
    // Offered only when there is somewhere to go: a URL has no location, and a
    // command on PATH has none unless a working directory is set.
    if (itemLocation(target) !== null) {
      work.push({
        key: "reveal",
        label: "Open location",
        run: () => props.onRevealLocation(target),
      });
    }
    work.push({ key: "edit", label: "Edit", run: () => props.onEdit(target) });
    work.forEach((entry, index) => add(entry, index === 0));

    add(
      { key: "delete", label: "Delete", danger: true, run: () => props.onDelete(target) },
      true,
    );

    return list;
  });

  createEffect(() => {
    if (!props.open || !menuRef) {
      return;
    }

    setMenuSize({ width: menuRef.offsetWidth, height: menuRef.offsetHeight });

    // Take focus so the arrow keys arrive here rather than at the grid behind
    // the menu, and start on the first entry.
    setHighlight(0);
    menuRef.focus();
  });

  const menuPosition = createMemo(() => {
    const margin = 12;
    const { width, height } = menuSize();
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);

    return {
      left: Math.min(Math.max(props.x, margin), maxLeft),
      top: Math.min(Math.max(props.y, margin), maxTop),
    };
  });

  const moveHighlight = (delta: number) => {
    const count = entries().length;
    if (count === 0) {
      return;
    }
    setHighlight((index) => (index + delta + count) % count);
  };

  const activeEntry = () => entries()[highlight()];

  return (
    <Show when={props.open && props.item}>
      <div class="fixed inset-0 z-scrim" onMouseDown={props.onClose} />
      <div
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        aria-label="Item actions"
        aria-activedescendant={activeEntry() ? menuItemId(activeEntry().key) : undefined}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveHighlight(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveHighlight(-1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            activeEntry()?.run();
          }
        }}
        class="fixed z-menu min-w-[180px] animate-pop-in overflow-hidden rounded-panel border border-line-strong bg-raised p-1 shadow-overlay outline-none"
        style={{
          left: `${menuPosition().left}px`,
          top: `${menuPosition().top}px`,
        }}
      >
        <For each={entries()}>
          {(entry, index) => (
            <>
              <Show when={entry.dividerBefore}>
                <div class="my-1 h-px bg-line" />
              </Show>
              <button
                type="button"
                id={menuItemId(entry.key)}
                role="menuitem"
                tabIndex={-1}
                onClick={entry.run}
                onMouseEnter={() => setHighlight(index())}
                class={`flex w-full items-center rounded-sharp px-2 py-1.5 text-left text-label transition-colors duration-100 ${
                  entry.danger
                    ? "text-danger hover:bg-danger-soft"
                    : "text-fg-muted hover:text-fg"
                } ${index() === highlight() ? (entry.danger ? "bg-danger-soft" : "bg-fill") : ""}`}
              >
                {entry.label}
              </button>
            </>
          )}
        </For>
      </div>
    </Show>
  );
}
