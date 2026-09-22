import { Show, createEffect, createMemo, createSignal } from "solid-js";
import type { LaunchItem } from "../types";

interface ItemContextMenuProps {
  item: LaunchItem | null;
  open: boolean;
  x: number;
  y: number;
  onLaunch: (item: LaunchItem) => void;
  onToggleFavorite: (item: LaunchItem) => void;
  onCopyCommand: (item: LaunchItem) => void;
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
            class="fixed z-menu min-w-[180px] animate-pop-in overflow-hidden rounded-panel border border-line-strong bg-raised p-1 shadow-overlay"
            style={{
              left: `${menuPosition().left}px`,
              top: `${menuPosition().top}px`,
            }}
          >
            <MenuButton onClick={() => props.onLaunch(item())}>Launch</MenuButton>
            <MenuButton onClick={() => props.onToggleFavorite(item())}>
              {item().isFavorite ? "Unpin" : "Pin"}
            </MenuButton>

            <Show when={item().kind === "command"}>
              <MenuDivider />
              <MenuButton onClick={() => props.onCopyCommand(item())}>
                Copy Command
              </MenuButton>
            </Show>

            <MenuDivider />
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
