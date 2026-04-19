import { For, Show, createEffect, createSignal } from "solid-js";
import type {
  ConfigDirectoryInfo,
  Group,
  Settings,
  WindowSizeLimits,
} from "../types";

interface SettingsPanelProps {
  open: boolean;
  settings: Settings;
  configDirectory: ConfigDirectoryInfo;
  windowSizeLimits: WindowSizeLimits;
  groups: Group[];
  onClose: () => void;
  onSetHotkey: (value: string) => void;
  onToggleStartup: (value: boolean) => void;
  onToggleCloseOnLaunch: (value: boolean) => void;
  onSetWindowSize: (width: number, height: number) => void;
  onChooseConfigDirectory: () => void;
  onOpenConfigDirectory: () => void;
  onResetConfigDirectory: () => void;
  onExportConfig: () => void | Promise<void>;
  onImportConfig: () => void | Promise<void>;
  onCreateGroup: (name: string) => void | Promise<void>;
  onRenameGroup: (group: Group, name: string) => void | Promise<void>;
  onDeleteGroup: (group: Group) => void;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [newGroupName, setNewGroupName] = createSignal("");
  const [editingGroupId, setEditingGroupId] = createSignal<string | null>(null);
  const [editingGroupName, setEditingGroupName] = createSignal("");
  const [groupError, setGroupError] = createSignal("");
  const [windowWidth, setWindowWidth] = createSignal(String(props.settings.windowWidth));
  const [windowHeight, setWindowHeight] = createSignal(
    String(props.settings.windowHeight),
  );

  createEffect(() => {
    setWindowWidth(String(props.settings.windowWidth));
    setWindowHeight(String(props.settings.windowHeight));
  });

  const groupNameExists = (name: string, excludeId?: string | null) =>
    props.groups.some(
      (group) =>
        group.id !== excludeId &&
        group.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );

  return (
    <Show when={props.open}>
      <div class="absolute inset-0 z-30 flex justify-end bg-slate-950/22 backdrop-blur-sm">
        <aside class="flex h-full w-[340px] min-h-0 flex-col overflow-hidden border-l border-white/12 bg-[linear-gradient(180deg,rgba(7,14,24,0.96),rgba(10,18,30,0.92))] px-5 py-6 shadow-[-18px_0_60px_rgba(0,0,0,0.24)]">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-[11px] uppercase tracking-[0.24em] text-white/38">
                Preferences
              </p>
              <h2 class="mt-1 text-xl font-semibold text-white">DeskRun</h2>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              class="rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/70 hover:bg-white/12"
            >
              Done
            </button>
          </div>

          <div class="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
            <section class="flex flex-col gap-4 rounded-[26px] border border-white/12 bg-white/6 p-4">
              <label class="flex flex-col gap-2">
                <span class="text-[11px] uppercase tracking-[0.22em] text-white/36">
                  Global Hotkey
                </span>
                <div class="flex items-center gap-2">
                  <input
                    value={props.settings.hotkey}
                    onChange={(event) => props.onSetHotkey(event.currentTarget.value)}
                    class="field-input"
                  />
                </div>
              </label>

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

              <div class="rounded-[18px] border border-white/10 bg-black/10 px-4 py-4">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm text-white/75">Window size</p>
                    <p class="mt-1 text-xs text-white/42">
                      {props.windowSizeLimits.minWidth}-{props.windowSizeLimits.maxWidth} px wide,{" "}
                      {props.windowSizeLimits.minHeight}-{props.windowSizeLimits.maxHeight} px high
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const width = Number(windowWidth());
                      const height = Number(windowHeight());
                      if (Number.isFinite(width) && Number.isFinite(height)) {
                        props.onSetWindowSize(width, height);
                      }
                    }}
                    class="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    Apply
                  </button>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <label class="flex flex-col gap-2 text-xs text-white/42">
                    <span>Width</span>
                    <input
                      type="number"
                      min={props.windowSizeLimits.minWidth}
                      max={props.windowSizeLimits.maxWidth}
                      step="20"
                      value={windowWidth()}
                      onInput={(event) => setWindowWidth(event.currentTarget.value)}
                      class="field-input"
                    />
                  </label>
                  <label class="flex flex-col gap-2 text-xs text-white/42">
                    <span>Height</span>
                    <input
                      type="number"
                      min={props.windowSizeLimits.minHeight}
                      max={props.windowSizeLimits.maxHeight}
                      step="20"
                      value={windowHeight()}
                      onInput={(event) => setWindowHeight(event.currentTarget.value)}
                      class="field-input"
                    />
                  </label>
                </div>
              </div>

              <div class="rounded-[18px] border border-white/10 bg-black/10 px-4 py-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm text-white/75">Config folder</p>
                    <p class="mt-1 text-xs leading-5 text-white/42">
                      Choose where DeskRun stores `settings.json`, `items.json`, and `icons`.
                    </p>
                  </div>
                  <span
                    class={`shrink-0 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${
                      props.configDirectory.usingCustomPath
                        ? "border-sky-200/18 bg-sky-300/10 text-sky-100/70"
                        : "border-white/10 bg-white/[0.04] text-white/42"
                    }`}
                  >
                    {props.configDirectory.usingCustomPath ? "Custom" : "Default"}
                  </span>
                </div>

                <div class="mt-3 rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-3">
                  <div class="text-[10px] uppercase tracking-[0.18em] text-white/24">
                    Current path
                  </div>
                  <div class="mt-2 break-all text-xs leading-5 text-white/64">
                    {props.configDirectory.currentPath}
                  </div>
                </div>

                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={props.onChooseConfigDirectory}
                    class="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/78 transition hover:bg-white/[0.1]"
                  >
                    Choose Folder
                  </button>
                  <button
                    type="button"
                    onClick={props.onOpenConfigDirectory}
                    class="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/78 transition hover:bg-white/[0.1]"
                  >
                    Open Folder
                  </button>
                  <button
                    type="button"
                    disabled={!props.configDirectory.usingCustomPath}
                    onClick={props.onResetConfigDirectory}
                    class="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/78 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Use Default
                  </button>
                </div>

                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={props.onExportConfig}
                    class="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/78 transition hover:bg-white/[0.1]"
                  >
                    Export Config
                  </button>
                  <button
                    type="button"
                    onClick={props.onImportConfig}
                    class="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/78 transition hover:bg-white/[0.1]"
                  >
                    Import Config
                  </button>
                </div>

                <div class="mt-3 text-[11px] leading-5 text-white/38">
                  Export creates a full config folder. Import replaces the current local settings,
                  items, and cached icons.
                </div>

                <Show when={props.configDirectory.usingCustomPath}>
                  <div class="mt-3 break-all text-[11px] leading-5 text-white/38">
                    Default path: {props.configDirectory.defaultPath}
                  </div>
                </Show>
              </div>
            </section>

            <section class="flex flex-col rounded-[26px] border border-white/12 bg-white/6 p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-[11px] uppercase tracking-[0.22em] text-white/36">
                    Groups
                  </p>
                  <h3 class="mt-1 text-base font-semibold text-white">
                    Manage categories
                  </h3>
                </div>
              </div>

              <div class="mt-4 flex gap-2">
                <input
                  value={newGroupName()}
                  onInput={(event) => {
                    setNewGroupName(event.currentTarget.value);
                    setGroupError("");
                  }}
                  class="field-input"
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
                  class="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900"
                >
                  Add
                </button>
              </div>

              <Show when={groupError()}>
                <div class="mt-3 rounded-[14px] border border-amber-300/14 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-50/82">
                  {groupError()}
                </div>
              </Show>

              <div class="mt-4 flex flex-col gap-3">
                <For each={props.groups}>
                  {(group) => (
                    <div class="rounded-[20px] border border-white/10 bg-black/10 p-3">
                      <Show
                        when={editingGroupId() === group.id}
                        fallback={
                          <div class="flex items-center justify-between gap-3">
                            <span class="truncate text-sm text-white">{group.name}</span>
                            <div class="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGroupId(group.id);
                                  setEditingGroupName(group.name);
                                }}
                                class="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => props.onDeleteGroup(group)}
                                class="rounded-xl border border-rose-400/18 px-3 py-2 text-xs text-rose-100 hover:bg-rose-500/14"
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
                            class="field-input"
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
                            class="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900"
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
    <label class="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 text-sm text-white/75">
      <span>{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        class="h-4 w-4 accent-white"
      />
    </label>
  );
}
