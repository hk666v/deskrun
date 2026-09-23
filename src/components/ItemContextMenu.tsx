import { Show, createEffect, createMemo, createSignal } from "solid-js";
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

export function ItemContextMenu(props: ItemContextMenuProps) {
  const [menuSize, setMenuSize] = createSignal({ width: 180, height: 220 });
  let menuRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.open || !menuRef) {
      return;
    }

    setMenuSize({
      width: menuRef.offsetWidth,
      height: menuRef.offsetHeight,
    });
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

  return (
    <Show when={props.open && props.item}>
      {(item) => (
        <>
          <div class="fixed inset-0 z-scrim" onMouseDown={props.onClose} />
          <div
            ref={menuRef}
            role="menu"
            aria-label="Item actions"
            class="fixed z-menu min-w-[180px] animate-pop-in overflow-hidden rounded-panel border border-line-strong bg-raised p-1 shadow-overlay"
            style={{
              left: `${menuPosition().left}px`,
              top: `${menuPosition().top}px`,
            }}
          >
            <MenuButton onClick={() => props.onLaunch(item())}>Launch</MenuButton>
            {/* Elevating a browser is meaningless, so it is not offered. */}
            <Show when={item().kind !== "url"}>
              <MenuButton onClick={() => props.onLaunchAsAdmin(item())}>
                Run as administrator
              </MenuButton>
            </Show>

            <MenuDivider />
            <MenuButton onClick={() => props.onToggleFavorite(item())}>
              {item().isFavorite ? "Unpin" : "Pin"}
            </MenuButton>
            <MenuButton onClick={() => props.onDuplicate(item())}>Duplicate</MenuButton>

            {/* Use the item, organize it, work with what it points at, change it,
                destroy it — in that order. */}
            <MenuDivider />

            <Show when={item().kind === "command"}>
              <MenuButton onClick={() => props.onCopyCommand(item())}>
                Copy Command
              </MenuButton>
            </Show>

            {/* Only offered when there is somewhere to go: a URL has no location,
                and a command on PATH has none unless a working directory is set. */}
            <Show when={itemLocation(item()) !== null}>
              <MenuButton onClick={() => props.onRevealLocation(item())}>
                Open location
              </MenuButton>
            </Show>

            <MenuButton onClick={() => props.onEdit(item())}>Edit</MenuButton>

            <MenuDivider />
            <MenuButton danger onClick={() => props.onDelete(item())}>
              Delete
            </MenuButton>
          </div>
        </>
      )}
    </Show>
  );
}

function MenuDivider() {
  return <div class="my-1 h-px bg-line" />;
}

interface MenuButtonProps {
  children: string;
  danger?: boolean;
  onClick: () => void;
}

function MenuButton(props: MenuButtonProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      class={`flex w-full items-center rounded-sharp px-2 py-1.5 text-left text-label transition-colors duration-100 ${
        props.danger
          ? "text-danger hover:bg-danger-soft"
          : "text-fg-muted hover:bg-fill hover:text-fg"
      }`}
    >
      {props.children}
    </button>
  );
}
