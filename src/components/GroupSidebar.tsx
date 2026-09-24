import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { Group } from "../types";
import { SYSTEM_VIEWS } from "../lib/views";
import { childrenOf, descendantIds, flattenGroups, type GroupRow } from "../lib/group-tree";

/// Where a dragged group is about to land: beside another one, or inside it.
type DropPlacement = "before" | "after" | "inside";

interface GroupSidebarProps {
  groups: Group[];
  currentGroupId: string | null;
  /// How many items each view holds, keyed by view id, for the counts that make
  /// a sidebar worth its width. A group's count is its whole subtree.
  counts: Map<string | null, number>;
  /// Which branches are open. Held by the app because the up/down keys walk the
  /// same rows this column draws, and there has to be one answer to what those
  /// rows are.
  isExpanded: (groupId: string) => boolean;
  onSetExpanded: (groupId: string, expanded: boolean) => void;
  onSelect: (groupId: string | null) => void;
  /// Whether the arrow keys are working in this column. Its selection marks are
  /// drawn at full strength when they are and quietly when they are not, which
  /// is the only thing on screen that says where up and down will go.
  live: boolean;
  /// Puts the caret back in the search field. Clicking this column must not take
  /// the keyboard away from it: the launcher is typed into, so after any of
  /// these actions the next keystroke has to land in the search box.
  onFocusSearch: () => void;
  /// Files a group inside another, or beside it. `beforeId` of null means last
  /// among the new siblings.
  onMoveGroup: (
    groupId: string,
    parentId: string | null,
    beforeId: string | null,
  ) => void | Promise<void>;
  /// Resolves to false when the name was rejected, so the inline editor can stay
  /// open with the name still in it.
  onRenameGroup: (group: Group, name: string) => Promise<boolean>;
  onDeleteGroup: (group: Group) => void;
  /// Resolves to false when the group could not be created, so the inline editor
  /// can stay open with the name still in it.
  onCreateGroup: (name: string, parentId: string | null) => Promise<boolean>;
}

/// One entry of the group's context menu.
interface GroupMenuEntry {
  key: string;
  label: string;
  danger?: boolean;
  run: () => void;
}

/// The views down the left, the groups underneath them, and the groups filed
/// inside those.
///
/// A column rather than a strip of tabs because the list is the wrong shape to
/// grow sideways: names are as long as the user made them and there is no room
/// to show them all in a row. It nests for the same reason — a group is a place
/// to put things, and one of the things worth putting in it is another group.
export function GroupSidebar(props: GroupSidebarProps) {
  const [dragGroupId, setDragGroupId] = createSignal<string | null>(null);
  const [dropTarget, setDropTarget] = createSignal<{
    groupId: string;
    placement: DropPlacement;
  } | null>(null);
  const [dragActive, setDragActive] = createSignal(false);
  /// Set when a drag finishes. The click that follows a drag lands on the common
  /// ancestor of the mousedown and mouseup targets, so it never reaches the
  /// button below — waiting for it to clear would swallow an unrelated click
  /// later on.
  let suppressClickUntil = 0;
  let pointerStart: { x: number; y: number } | null = null;
  const rowRefs = new Map<string, HTMLDivElement>();
  /// Which group the inline editor is open under: `undefined` when it is closed,
  /// `null` for the top level.
  const [creatingIn, setCreatingIn] = createSignal<{ parentId: string | null } | null>(null);
  const [draftName, setDraftName] = createSignal("");
  let createInput: HTMLInputElement | undefined;
  /// The group whose name is being edited in place, if any.
  const [renamingId, setRenamingId] = createSignal<string | null>(null);
  const [renameDraft, setRenameDraft] = createSignal("");
  let renameInput: HTMLInputElement | undefined;
  const [menu, setMenu] = createSignal<{ group: Group; x: number; y: number } | null>(null);
  const [menuHighlight, setMenuHighlight] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  const isExpanded = (groupId: string) => props.isExpanded(groupId);
  const setExpanded = (groupId: string, expanded: boolean) =>
    props.onSetExpanded(groupId, expanded);

  const rows = createMemo(() => flattenGroups(props.groups, isExpanded));

  const startCreate = (parentId: string | null) => {
    setDraftName("");
    setCreatingIn({ parentId });
    // A new group goes inside a group, so its parent has to be open for the
    // result to be anywhere the user can see it.
    if (parentId) {
      setExpanded(parentId, true);
    }
  };

  const cancelCreate = () => {
    setCreatingIn(null);
    setDraftName("");
    // The field the name was being typed into has just been removed, so focus
    // would fall to nothing; the launcher is typed into, so it goes home.
    props.onFocusSearch();
  };

  const commitCreate = async () => {
    const name = draftName().trim();
    if (name.length === 0) {
      cancelCreate();
      return;
    }

    // Stay open when it fails, so a rejected name is not thrown away.
    if (await props.onCreateGroup(name, creatingIn()?.parentId ?? null)) {
      cancelCreate();
    } else {
      createInput?.focus();
    }
  };

  createEffect(() => {
    if (creatingIn()) {
      createInput?.focus();
    }
  });

  const startRename = (group: Group) => {
    setRenamingId(group.id);
    setRenameDraft(group.name);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
    props.onFocusSearch();
  };

  const commitRename = async () => {
    const group = props.groups.find((entry) => entry.id === renamingId());
    const name = renameDraft().trim();
    if (!group || name.length === 0 || name === group.name) {
      cancelRename();
      return;
    }

    // Stay open when it fails, so a rejected name is not thrown away.
    if (await props.onRenameGroup(group, name)) {
      cancelRename();
    } else {
      renameInput?.focus();
    }
  };

  createEffect(() => {
    if (renamingId()) {
      renameInput?.focus();
      renameInput?.select();
    }
  });

  /// What a group row offers on right-click. Creating and renaming are here as
  /// well as on the row itself: the row has room for one hover button, and this
  /// is where the rest of them fit.
  const menuEntries = (group: Group): GroupMenuEntry[] => {
    const entries: GroupMenuEntry[] = [
      { key: "inside", label: "New group inside", run: () => startCreate(group.id) },
      { key: "rename", label: "Rename", run: () => startRename(group) },
    ];

    // Only worth offering to something that is not already at the top.
    if (group.parentId) {
      entries.push({
        key: "top",
        label: "Move to top level",
        run: () => void props.onMoveGroup(group.id, null, null),
      });
    }

    entries.push({
      key: "delete",
      label: "Delete",
      danger: true,
      run: () => props.onDeleteGroup(group),
    });

    return entries;
  };

  const openMenu = (group: Group, x: number, y: number) => {
    setMenu({ group, x, y });
    setMenuHighlight(0);
  };

  const runMenuEntry = (entry: GroupMenuEntry | undefined) => {
    if (!entry) {
      return;
    }
    setMenu(null);
    // Hand the keyboard back first: an entry that opens a name field takes it
    // again itself, and everything else leaves the caret where typing expects it.
    props.onFocusSearch();
    entry.run();
  };

  // The menu owns the keyboard while it is up, the way the item menu does.
  createEffect(() => {
    if (!menu() || !menuRef) {
      return;
    }

    setMenuSize({ width: menuRef.offsetWidth, height: menuRef.offsetHeight });
    menuRef.focus();
  });

  const [menuSize, setMenuSize] = createSignal({ width: 180, height: 160 });
  const menuPosition = createMemo(() => {
    const margin = 12;
    const { width, height } = menuSize();
    return {
      left: Math.min(
        Math.max(menu()?.x ?? margin, margin),
        Math.max(margin, window.innerWidth - width - margin),
      ),
      top: Math.min(
        Math.max(menu()?.y ?? margin, margin),
        Math.max(margin, window.innerHeight - height - margin),
      ),
    };
  });

  const clearDragState = () => {
    setDragGroupId(null);
    setDropTarget(null);
    setDragActive(false);
    pointerStart = null;
  };

  /// Where a drop at this point would file the group: above the row, below it,
  /// or inside it.
  ///
  /// The middle of a row means "inside", which is the only gesture that can say
  /// so — dropping between two rows can mean either, and the edges are already
  /// spoken for by "before" and "after".
  const placementAt = (group: Group, rect: DOMRect, y: number): DropPlacement => {
    const dragged = dragGroupId();
    const offset = (y - rect.top) / rect.height;
    const inside = dragged
      ? !descendantIds(props.groups, dragged).includes(group.id) && group.id !== dragged
      : false;

    if (!inside) {
      return offset < 0.5 ? "before" : "after";
    }
    if (offset < 0.3) {
      return "before";
    }
    return offset > 0.7 ? "after" : "inside";
  };

  onMount(() => {
    const resolveDropTarget = (x: number, y: number) => {
      for (const group of props.groups) {
        const element = rowRefs.get(group.id);
        // A group inside a collapsed branch has no row in the document, so a
        // drag cannot land somewhere the user cannot see.
        if (!element?.isConnected) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const inside =
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        if (inside) {
          return {
            groupId: group.id,
            placement: placementAt(group, rect, y),
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

      if (!dragActive()) {
        return;
      }

      const target = resolveDropTarget(event.clientX, event.clientY);
      setDropTarget(target && target.groupId !== dragGroupId() ? target : null);
    };

    const handleMouseUp = async (event: MouseEvent) => {
      const sourceId = dragGroupId();
      const target = resolveDropTarget(event.clientX, event.clientY);

      if (dragActive() && sourceId && target && target.groupId !== sourceId) {
        const owner = props.groups.find((group) => group.id === target.groupId);
        if (owner) {
          suppressClickUntil = performance.now() + 250;
          if (target.placement === "inside") {
            await props.onMoveGroup(sourceId, owner.id, null);
            // Dropping into a closed group would file it somewhere invisible.
            setExpanded(owner.id, true);
          } else {
            const parentId = owner.parentId ?? null;
            const siblings = childrenOf(props.groups, parentId);
            const index = siblings.findIndex((group) => group.id === owner.id);
            const beforeId =
              target.placement === "before"
                ? owner.id
                : siblings[index + 1]?.id ?? null;
            await props.onMoveGroup(sourceId, parentId, beforeId);
          }
        }
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

  // The group the user is looking at scrolls itself into view, and so does its
  // open editor: the column can be longer than the window, and the keyboard
  // walks every group whether or not it is on screen.
  createEffect(() => {
    const id = props.currentGroupId;
    if (id) {
      rowRefs.get(id)?.scrollIntoView({ block: "nearest" });
    }
  });

  /// The inline name field, shown where the group it will create has to appear:
  /// under the row it will sit inside, indented one step further.
  const editor = (depth: number) => (
    <input
      ref={createInput}
      data-inline-editor
      value={draftName()}
      onInput={(event) => setDraftName(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commitCreate();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelCreate();
        }
      }}
      onBlur={cancelCreate}
      placeholder="New group"
      aria-label="New group name"
      style={{ "margin-left": `${8 + depth * 12}px` }}
      class="my-0.5 h-7 w-[calc(100%-8px)] shrink-0 rounded-sharp border border-signal-line bg-inset px-2 text-label text-fg outline-none placeholder:text-fg-faint"
    />
  );

  const dropLine = (groupId: string, placement: DropPlacement, side: "top" | "bottom") => (
    <div
      class={`pointer-events-none absolute inset-x-1 h-[2px] rounded-full bg-signal transition ${
        dropTarget()?.groupId === groupId && dropTarget()?.placement === placement
          ? "opacity-100"
          : "opacity-0"
      } ${side === "top" ? "top-[-1px]" : "bottom-[-1px]"}`}
    />
  );

  const systemRow = (viewId: string | null, label: string) => {
    const active = () => props.currentGroupId === viewId;
    return (
      <button
        type="button"
        aria-current={active() ? "page" : undefined}
        onClick={() => props.onSelect(viewId)}
        // The caret stays in the search field, as it does for the group rows.
        onMouseDown={(event) => event.preventDefault()}
        title={label}
        class={`relative flex h-7 w-full shrink-0 items-center gap-2 rounded-sharp px-2 text-left text-label transition-colors duration-100 ${
          active() ? "bg-fill-strong text-fg" : "text-fg-muted hover:bg-fill hover:text-fg"
        }`}
      >
        <Show when={active()}>{selectionMarks()}</Show>
        <span class="min-w-0 flex-1 truncate">{label}</span>
        <span class="shrink-0 font-mono text-micro text-fg-faint">
          {props.counts.get(viewId) ?? 0}
        </span>
      </button>
    );
  };

  const groupRow = (row: GroupRow) => {
    const group = row.group;
    const active = () => props.currentGroupId === group.id;
    const nested = () => childrenOf(props.groups, group.id).length > 0;

    return (
      <div
        ref={(element) => {
          rowRefs.set(group.id, element);
        }}
        class={`group/row relative flex h-7 w-full shrink-0 items-center gap-1 rounded-sharp pr-1 transition-colors duration-100 ${
          active() ? "bg-fill-strong" : "hover:bg-fill"
        } ${
          dragGroupId() === group.id && dragActive() ? "cursor-grabbing opacity-40" : "cursor-grab"
        } ${
          dropTarget()?.groupId === group.id && dropTarget()?.placement === "inside"
            ? "ring-1 ring-signal-line"
            : ""
        }`}
        style={{ "padding-left": `${4 + row.depth * 12}px` }}
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          // Keeps the caret in the search field: a row that takes focus would
          // swallow everything typed next.
          event.preventDefault();
          pointerStart = { x: event.clientX, y: event.clientY };
          setDragGroupId(group.id);
          setDropTarget(null);
          setDragActive(false);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu(group, event.clientX, event.clientY);
        }}
      >
        {dropLine(group.id, "before", "top")}
        {dropLine(group.id, "after", "bottom")}

        <Show when={active()}>{selectionMarks()}</Show>

        {/* A spacer where the chevron would be, so names line up whether or not
            a group has anything inside it. */}
        <Show
          when={nested()}
          fallback={<span class="w-4 shrink-0" aria-hidden="true" />}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(group.id, !isExpanded(group.id));
            }}
            // Focus stays where it is, so a collapse does not cost the user the
            // query they were typing.
            onMouseDown={(event) => event.preventDefault()}
            aria-expanded={isExpanded(group.id)}
            aria-label={isExpanded(group.id) ? `Collapse ${group.name}` : `Expand ${group.name}`}
            title={isExpanded(group.id) ? "Collapse" : "Expand"}
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sharp text-fg-faint transition-colors duration-100 hover:text-fg-muted"
          >
            <svg
              viewBox="0 0 16 16"
              class={`h-3 w-3 transition-transform duration-100 ${
                isExpanded(group.id) ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 3.5L10.5 8L6 12.5" />
            </svg>
          </button>
        </Show>

        <Show
          when={renamingId() === group.id}
          fallback={
            <button
              type="button"
              aria-current={active() ? "page" : undefined}
              onClick={(event) => {
                if (performance.now() < suppressClickUntil) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                props.onSelect(group.id);
              }}
              title={group.name}
              class={`min-w-0 flex-1 truncate text-left text-label transition-colors duration-100 ${
                active() ? "text-fg" : "text-fg-muted group-hover/row:text-fg"
              }`}
            >
              {group.name}
            </button>
          }
        >
          <input
            ref={renameInput}
            data-inline-editor
            value={renameDraft()}
            onInput={(event) => setRenameDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelRename();
              }
            }}
            onBlur={cancelRename}
            aria-label={`Rename ${group.name}`}
            class="h-6 min-w-0 flex-1 rounded-sharp border border-signal-line bg-inset px-1 text-label text-fg outline-none"
          />
        </Show>

        <span class="shrink-0 font-mono text-micro text-fg-faint">
          {props.counts.get(group.id) ?? 0}
        </span>

        {/* Creating inside a group belongs on the group, and only while the
            pointer is on the row: a column of plus signs would read as a
            toolbar rather than as a list. */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            startCreate(group.id);
          }}
          // The name field this opens takes focus itself; this keeps the click
          // from taking it first and cancelling on the way through.
          onMouseDown={(event) => event.preventDefault()}
          title={`New group inside ${group.name}`}
          aria-label={`New group inside ${group.name}`}
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sharp text-fg-faint opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 hover:text-fg-muted focus-visible:opacity-100"
        >
          <svg
            viewBox="0 0 16 16"
            class="h-3 w-3"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </button>
      </div>
    );
  };

  /// The two marks that say "this is the view you are on": the wash fading to
  /// the right, and the bar it is anchored to — the same pair the list's
  /// selected row carries.
  ///
  /// They are drawn at full strength only in the live column. That dimming is
  /// the whole cue for where the arrow keys are working, so it is deliberately
  /// the marks and not the text: the names have to stay readable either way.
  const selectionMarks = () => (
    // Positioned rather than a bare wrapper: rows are flex containers, and a
    // plain div here would take a slot and a gap with it.
    <div class={`pointer-events-none absolute inset-0 ${props.live ? "" : "opacity-40"}`}>
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-signal-soft to-transparent" />
      <div class="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-gradient-to-b from-signal to-signal-hot" />
    </div>
  );

  return (
    <nav
      aria-label="Views and groups"
      // Above the shell's drag strip, which reaches across the top of the window
      // and would otherwise swallow the first row's clicks.
      class="relative z-chrome flex w-[168px] shrink-0 flex-col rounded-panel border border-line bg-surface p-2"
    >
      <For each={SYSTEM_VIEWS}>{(view) => systemRow(view.id, view.label)}</For>

      <Show when={props.groups.length > 0}>
        <div aria-hidden="true" class="my-2 h-px shrink-0 bg-line" />
      </Show>

      {/* The groups scroll; everything above and below them stays put, so the
          built-in views never scroll away and "New group" is always in reach. */}
      <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
        <For each={rows()}>
          {(row) => (
            <>
              {groupRow(row)}
              <Show when={creatingIn()?.parentId === row.group.id}>
                {editor(row.depth + 1)}
              </Show>
            </>
          )}
        </For>
      </div>

      <Show
        when={creatingIn()?.parentId === null}
        fallback={
          <button
            type="button"
            onClick={() => startCreate(null)}
            title="New group"
            class="mt-2 flex h-7 shrink-0 items-center gap-2 rounded-sharp px-2 text-left text-label text-fg-subtle transition-colors duration-100 hover:bg-fill hover:text-fg-muted"
          >
            <svg
              viewBox="0 0 16 16"
              class="h-3 w-3 shrink-0"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            <span class="truncate">New group</span>
          </button>
        }
      >
        {editor(0)}
      </Show>

      <Show when={menu()}>
        {(state) => (
          <>
            <div
              class="fixed inset-0 z-scrim"
              onMouseDown={() => {
                setMenu(null);
                props.onFocusSearch();
              }}
            />
            <div
              ref={menuRef}
              role="menu"
              tabIndex={-1}
              aria-label="Group actions"
              // The app's key handler stands down for this, the way it does for
              // an inline editor: arrow keys and Escape belong to the menu.
              data-group-menu
              onKeyDown={(event) => {
                const entries = menuEntries(state().group);
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMenuHighlight((current) => (current + 1) % entries.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMenuHighlight(
                    (current) => (current - 1 + entries.length) % entries.length,
                  );
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  runMenuEntry(entries[menuHighlight()]);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setMenu(null);
                  props.onFocusSearch();
                }
              }}
              class="fixed z-menu min-w-[180px] animate-pop-in overflow-hidden rounded-panel border border-line-strong bg-raised p-1 shadow-overlay outline-none"
              style={{
                left: `${menuPosition().left}px`,
                top: `${menuPosition().top}px`,
              }}
            >
              <For each={menuEntries(state().group)}>
                {(entry, index) => (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => runMenuEntry(entry)}
                    onMouseEnter={() => setMenuHighlight(index())}
                    class={`flex w-full items-center rounded-sharp px-2 py-1.5 text-left text-label transition-colors duration-100 ${
                      entry.danger
                        ? "text-danger hover:bg-danger-soft"
                        : "text-fg-muted hover:text-fg"
                    } ${
                      index() === menuHighlight()
                        ? entry.danger
                          ? "bg-danger-soft"
                          : "bg-fill"
                        : ""
                    }`}
                  >
                    {entry.label}
                  </button>
                )}
              </For>
            </div>
          </>
        )}
      </Show>
    </nav>
  );
}
