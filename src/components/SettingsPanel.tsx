import { For, Show, createEffect, createSignal } from "solid-js";
import type { Group, Settings, WindowSizeLimits } from "../types";

interface SettingsPanelProps {
  open: boolean;
  settings: Settings;
  windowSizeLimits: WindowSizeLimits;
  groups: Group[];
  onClose: () => void;
  onSetHotkey: (value: string) => void;
  onToggleStartup: (value: boolean) => void;
  onToggleCloseOnLaunch: (value: boolean) => void;
  onSetWindowSize: (width: number, height: number) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (group: Group, name: string) => void;
  onDeleteGroup: (group: Group) => void;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [newGroupName, setNewGroupName] = createSignal("");
  const [editingGroupId, setEditingGroupId] = createSignal<string | null>(null);
  const [editingGroupName, setEditingGroupName] = createSignal("");
  const [windowWidth, setWindowWidth] = createSignal(String(props.settings.windowWidth));
  const [windowHeight, setWindowHeight] = createSignal(
    String(props.settings.windowHeight),
  );

  createEffect(() => {
    setWindowWidth(String(props.settings.windowWidth));
    setWindowHeight(String(props.settings.windowHeight));
  });

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

          <section class="mt-6 flex flex-col gap-4 rounded-[26px] border border-white/12 bg-white/6 p-4">
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
          </section>

          <section class="mt-6 flex min-h-0 flex-1 flex-col rounded-[26px] border border-white/12 bg-white/6 p-4">
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
                onInput={(event) => setNewGroupName(event.currentTarget.value)}
                class="field-input"
                placeholder="New group name"
              />
              <button
                type="button"
                onClick={() => {
                  const value = newGroupName().trim();
                  if (value) {
                    props.onCreateGroup(value);
                    setNewGroupName("");
                  }
                }}
                class="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900"
              >
                Add
              </button>
            </div>

            <div class="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div class="flex flex-col gap-3">
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
                          onInput={(event) => setEditingGroupName(event.currentTarget.value)}
                          class="field-input"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const value = editingGroupName().trim();
                            if (value) {
                              props.onRenameGroup(group, value);
                            }
                            setEditingGroupId(null);
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
            </div>
          </section>
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
