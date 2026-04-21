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
  const [menuSize, setMenuSize] = createSignal({ width: 220, height: 240 });
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
    const margin = 16;
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
          <div class="absolute inset-0 z-40" onMouseDown={props.onClose} />
          <div
            ref={menuRef}
            class="absolute z-50 min-w-[180px] overflow-hidden rounded-[22px] border border-white/14 bg-[linear-gradient(180deg,rgba(10,18,30,0.98),rgba(12,20,32,0.96))] p-2 shadow-[0_26px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl"
            style={{
              left: `${menuPosition().left}px`,
              top: `${menuPosition().top}px`,
            }}
          >
            <MenuButton onClick={() => props.onLaunch(item())}>Launch</MenuButton>
            <MenuButton onClick={() => props.onToggleFavorite(item())}>
              {item().isFavorite ? "Remove Favorite" : "Add Favorite"}
            </MenuButton>
            <Show when={item().kind === "command"}>
              <MenuButton onClick={() => props.onCopyCommand(item())}>
                Copy Command
              </MenuButton>
            </Show>
            <MenuButton onClick={() => props.onEdit(item())}>Edit</MenuButton>
            <MenuButton danger onClick={() => props.onDelete(item())}>
              Delete
            </MenuButton>
          </div>
        </>
      )}
    </Show>
  );
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
      class={`flex w-full items-center rounded-2xl px-4 py-3 text-left text-sm transition ${
        props.danger
          ? "text-rose-100 hover:bg-rose-500/14"
          : "text-white/84 hover:bg-white/10"
      }`}
    >
      {props.children}
    </button>
  );
}
