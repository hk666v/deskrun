import { For, Show, createSignal } from "solid-js";
import type { ConfigDirectoryInfo, Group, Settings } from "../types";

interface SettingsPanelProps {
  open: boolean;
  settings: Settings;
  configDirectory: ConfigDirectoryInfo;
  groups: Group[];
  onClose: () => void;
  onSetHotkey: (value: string) => void;
  onToggleStartup: (value: boolean) => void;
  onToggleCloseOnLaunch: (value: boolean) => void;
  onToggleFollowCursor: (value: boolean) => void;
  onSetDisplayMode: (value: "grid" | "list") => void;
  onSetUiScale: (value: number) => void;
  onChooseConfigDirectory: () => void;
  onOpenConfigDirectory: () => void;
  onResetConfigDirectory: () => void;
  onExportConfig: () => void | Promise<void>;
  onImportConfig: () => void | Promise<void>;
  onCreateGroup: (name: string) => void | Promise<void>;
  onRenameGroup: (group: Group, name: string) => void | Promise<void>;
  onDeleteGroup: (group: Group) => void;
}

const ROW = "border-b border-line py-2.5 last:border-b-0";
/// The interface sizes on offer, as webview zoom factors.
const UI_SCALE_STEPS = [0.9, 1, 1.15, 1.3];
const GHOST_BUTTON =
  "rounded-sharp border border-line px-2 py-1 text-meta text-fg-muted transition-colors duration-100 hover:bg-fill hover:text-fg disabled:cursor-not-allowed disabled:opacity-45";

export function SettingsPanel(props: SettingsPanelProps) {
  const [newGroupName, setNewGroupName] = createSignal("");
  const [editingGroupId, setEditingGroupId] = createSignal<string | null>(null);
  const [editingGroupName, setEditingGroupName] = createSignal("");
  const [groupError, setGroupError] = createSignal("");

  const groupNameExists = (name: string, excludeId?: string | null) =>
    props.groups.some(
      (group) =>
        group.id !== excludeId &&
        group.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-scrim flex animate-fade-in justify-end rounded-window bg-scrim"
        onClick={(event) => {
          // Clicking the scrim dismisses, matching the editor dialog and the
          // context menu. Only the scrim itself counts, not a click that
          // bubbled up from inside the drawer.
          if (event.target === event.currentTarget) {
            props.onClose();
          }
        }}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          class="flex h-full min-h-0 w-[340px] animate-slide-in flex-col overflow-hidden border-l border-line bg-raised shadow-overlay"
        >
          <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 class="text-title font-semibold text-fg">Settings</h2>
            <button
              type="button"
              onClick={props.onClose}
              class="rounded-sharp px-2 py-1 text-label text-fg-subtle transition-colors duration-100 hover:bg-fill hover:text-fg"
            >
              Done
            </button>
          </div>

          <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
            <section class="flex flex-col">
              <h3 class="mb-1 text-label font-medium text-fg">General</h3>

              <div class={`flex flex-col gap-1 ${ROW}`}>
                <span class="text-meta text-fg-subtle">Global hotkey</span>
                <input
                  value={props.settings.hotkey}
                  onChange={(event) => props.onSetHotkey(event.currentTarget.value)}
                  class="field-input"
                />
              </div>

              <ToggleRow
                label="Launch at login"
                checked={props.settings.launchOnStartup}
                onChange={props.onToggleStartup}
              />
              <ToggleRow
                label="Hide after launch"
                checked={props.settings.closeOnLaunch}
                onChange={props.onToggleCloseOnLaunch}
              />

              <label class={`flex items-center justify-between gap-3 ${ROW}`}>
                <span class="min-w-0">
                  <span class="block text-label text-fg-muted">Follow the pointer</span>
                  <span class="mt-0.5 block text-meta text-fg-subtle">
                    Open on the monitor the mouse is on, centred. Off reuses the last
                    position instead.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={props.settings.followCursorMonitor}
                  onChange={(event) => props.onToggleFollowCursor(event.currentTarget.checked)}
                  class="h-3.5 w-3.5 shrink-0 accent-signal"
                />
              </label>

              <div class={`flex items-center justify-between gap-3 ${ROW}`}>
                <div class="min-w-0">
                  <p class="text-label text-fg-muted">Display mode</p>
                  <p class="mt-0.5 text-meta text-fg-subtle">
                    Card grid, or a denser list.
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-0.5 rounded-sharp border border-line p-0.5">
                  <SegmentButton
                    active={props.settings.displayMode === "grid"}
                    onClick={() => props.onSetDisplayMode("grid")}
                  >
                    Grid
                  </SegmentButton>
                  <SegmentButton
                    active={props.settings.displayMode === "list"}
                    onClick={() => props.onSetDisplayMode("list")}
                  >
                    List
                  </SegmentButton>
                </div>
              </div>

              {/* Steps rather than a slider: each one is a size the launcher was
                  looked at, and the endpoints are as far as the layout still
                  holds together in the default window. */}
              <div class={`flex flex-col gap-2 ${ROW}`}>
                <div class="min-w-0">
                  <p class="text-label text-fg-muted">Interface size</p>
                  <p class="mt-0.5 text-meta text-fg-subtle">
                    Text, icons and spacing grow together. A larger size leaves room for
                    less of the list, so widen the window to match.
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-0.5 self-start rounded-sharp border border-line p-0.5">
                  <For each={UI_SCALE_STEPS}>
                    {(step) => (
                      <SegmentButton
                        active={Math.abs(props.settings.uiScale - step) < 0.001}
                        onClick={() => props.onSetUiScale(step)}
                      >
                        {`${Math.round(step * 100)}%`}
                      </SegmentButton>
                    )}
                  </For>
                </div>
              </div>

            </section>

            <section class="flex flex-col">
              <div class="mb-1 flex items-center justify-between gap-3">
                <h3 class="text-label font-medium text-fg">Config folder</h3>
                <span
                  class={`shrink-0 rounded-sharp border px-1.5 py-0.5 text-micro ${
                    props.configDirectory.usingCustomPath
                      ? "border-signal-line bg-signal-soft text-signal"
                      : "border-line text-fg-faint"
                  }`}
                >
                  {props.configDirectory.usingCustomPath ? "Custom" : "Default"}
                </span>
              </div>

              <div class="flex flex-col gap-2 border-b border-line py-2.5">
                <p class="text-meta break-all text-fg-muted">
                  {props.configDirectory.currentPath}
                </p>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={props.onChooseConfigDirectory}
                    class={GHOST_BUTTON}
                  >
                    Choose folder
                  </button>
                  <button
                    type="button"
                    onClick={props.onOpenConfigDirectory}
                    class={GHOST_BUTTON}
                  >
                    Open folder
                  </button>
                  <button
                    type="button"
                    disabled={!props.configDirectory.usingCustomPath}
                    onClick={props.onResetConfigDirectory}
                    class={GHOST_BUTTON}
                  >
                    Use default
                  </button>
                </div>
              </div>

              <div class="flex flex-col gap-2 border-b border-line py-2.5 last:border-b-0">
                <p class="text-meta text-fg-subtle">
                  Export writes a complete config folder. Import replaces the current
                  settings, items, and cached icons.
                </p>
                <div class="flex flex-wrap gap-1.5">
                  <button type="button" onClick={props.onExportConfig} class={GHOST_BUTTON}>
                    Export config
                  </button>
                  <button type="button" onClick={props.onImportConfig} class={GHOST_BUTTON}>
                    Import config
                  </button>
                </div>
                <Show when={props.configDirectory.usingCustomPath}>
                  <p class="text-meta break-all text-fg-faint">
                    Default: {props.configDirectory.defaultPath}
                  </p>
                </Show>
              </div>
            </section>

            <section class="flex flex-col">
              <h3 class="mb-1 text-label font-medium text-fg">Groups</h3>

              <div class="flex flex-col gap-2 border-b border-line py-2.5">
                <div class="flex items-center gap-2">
                  <input
                    value={newGroupName()}
                    onInput={(event) => {
                      setNewGroupName(event.currentTarget.value);
                      setGroupError("");
                    }}
                    class="field-input min-w-0 flex-1"
                    placeholder="New group name"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const value = newGroupName().trim();
                      if (!value) {
                        return;
                      }

                      if (groupNameExists(value)) {
                        setGroupError("Group name already exists. Please choose another one.");
                        return;
                      }

                      try {
                        await props.onCreateGroup(value);
                        setNewGroupName("");
                        setGroupError("");
                      } catch (error) {
                        setGroupError(
                          error instanceof Error
                            ? error.message
                            : "Unable to create group. Please try another name.",
                        );
                      }
                    }}
                    class="shrink-0 rounded-sharp bg-signal px-3 py-1.5 text-label font-semibold text-canvas transition-opacity duration-100 hover:opacity-90"
                  >
                    Add
                  </button>
                </div>

                <Show when={groupError()}>
                  <div class="rounded-sharp border border-danger-soft px-2 py-1.5 text-meta text-danger">
                    {groupError()}
                  </div>
                </Show>
              </div>

              <div class="flex flex-col">
                <For each={props.groups}>
                  {(group) => (
                    <div class="border-b border-line py-2 last:border-b-0">
                      <Show
                        when={editingGroupId() === group.id}
                        fallback={
                          <div class="flex items-center justify-between gap-3">
                            <span class="truncate text-label text-fg-muted">{group.name}</span>
                            <div class="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGroupId(group.id);
                                  setEditingGroupName(group.name);
                                }}
                                class={GHOST_BUTTON}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => props.onDeleteGroup(group)}
                                class="rounded-sharp border border-danger-soft px-2 py-1 text-meta text-danger transition-colors duration-100 hover:bg-danger-soft"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        }
                      >
                        <div class="flex items-center gap-2">
                          <input
                            value={editingGroupName()}
                            onInput={(event) => {
                              setEditingGroupName(event.currentTarget.value);
                              setGroupError("");
                            }}
                            class="field-input min-w-0 flex-1"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const value = editingGroupName().trim();
                              if (!value) {
                                setGroupError("Group name cannot be empty.");
                                return;
                              }

                              if (groupNameExists(value, group.id)) {
                                setGroupError("Group name already exists. Please choose another one.");
                                return;
                              }

                              try {
                                await props.onRenameGroup(group, value);
                                setEditingGroupId(null);
                                setGroupError("");
                              } catch (error) {
                                setGroupError(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to rename group. Please try another name.",
                                );
                              }
                            }}
                            class="shrink-0 rounded-sharp bg-signal px-2 py-1 text-meta font-semibold text-canvas transition-opacity duration-100 hover:opacity-90"
                          >
                            Save
                          </button>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </Show>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow(props: ToggleRowProps) {
  return (
    <label class={`flex items-center justify-between gap-3 ${ROW}`}>
      <span class="text-label text-fg-muted">{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        class="h-3.5 w-3.5 accent-signal"
      />
    </label>
  );
}

interface SegmentButtonProps {
  active: boolean;
  children: string;
  onClick: () => void;
}

function SegmentButton(props: SegmentButtonProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`rounded-sharp px-2 py-1 text-meta transition-colors duration-100 ${
        props.active
          ? "bg-signal font-semibold text-canvas"
          : "text-fg-muted hover:bg-fill hover:text-fg"
      }`}
    >
      {props.children}
    </button>
  );
}
