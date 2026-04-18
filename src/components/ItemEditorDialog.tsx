import { Show, createEffect, createSignal } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import type { Group, LaunchItem } from "../types";

interface ItemEditorDialogProps {
  open: boolean;
  mode: "create-url" | "edit";
  item: LaunchItem | null;
  groups: Group[];
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onDelete?: (item: LaunchItem) => void;
  onSave: (payload: {
    name: string;
    target: string;
    groupId: string | null;
    customIconPath?: string;
    clearCustomIcon?: boolean;
  }) => void;
}

export function ItemEditorDialog(props: ItemEditorDialogProps) {
  const [name, setName] = createSignal("");
  const [target, setTarget] = createSignal("");
  const [groupId, setGroupId] = createSignal<string | null>(null);
  const [iconMode, setIconMode] = createSignal<"auto" | "custom">("auto");
  const [customIconPath, setCustomIconPath] = createSignal<string>();
  const [clearCustomIcon, setClearCustomIcon] = createSignal(false);

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const item = props.item;
    setName(item?.name ?? "");
    setTarget(item?.target ?? "https://");
    setGroupId(item?.groupId ?? null);
    setIconMode(item?.iconSource === "custom" ? "custom" : "auto");
    setCustomIconPath(undefined);
    setClearCustomIcon(false);
  });

  const pickIcon = async () => {
    props.onBusyChange(true);
    try {
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Image",
            extensions: ["png", "jpg", "jpeg", "ico", "bmp", "webp"],
          },
        ],
      });

      if (typeof file === "string") {
        setIconMode("custom");
        setCustomIconPath(file);
        setClearCustomIcon(false);
      }
    } finally {
      props.onBusyChange(false);
    }
  };

  return (
    <Show when={props.open}>
      <div class="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/28 backdrop-blur-sm">
        <div class="w-[520px] rounded-[30px] border border-white/16 bg-[linear-gradient(180deg,rgba(10,18,30,0.94),rgba(12,22,35,0.88))] p-6 shadow-[0_28px_80px_rgba(4,10,20,0.38)]">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold text-white">
                {props.mode === "create-url" ? "添加网址" : "编辑启动项"}
              </h2>
              <p class="mt-1 text-sm text-white/46">
                {props.mode === "create-url"
                  ? "创建一个可被快速打开的网址入口。"
                  : "调整名称、目标路径、分组和自定义图标。"}
              </p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              class="rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/70 transition hover:bg-white/12"
            >
              Close
            </button>
          </div>

          <div class="mt-6 flex flex-col gap-4">
            <Field label="Name">
              <input
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
                class="field-input"
                placeholder="例如：Chrome、Workspace、Docs"
              />
            </Field>

            <Field label={props.mode === "create-url" ? "URL" : "Target"}>
              <input
                value={target()}
                onInput={(event) => setTarget(event.currentTarget.value)}
                class="field-input"
                placeholder={
                  props.mode === "create-url"
                    ? "https://example.com"
                    : "C:\\Program Files\\App\\app.exe"
                }
              />
            </Field>

            <Field label="Group">
              <select
                value={groupId() ?? ""}
                onChange={(event) =>
                  setGroupId(event.currentTarget.value || null)
                }
                class="field-input field-select"
              >
                <option value="">Ungrouped</option>
                {props.groups.map((group) => (
                  <option value={group.id}>{group.name}</option>
                ))}
              </select>
            </Field>

            <Show when={props.mode === "edit"}>
              <div class="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/6 p-4">
                <button
                  type="button"
                  onClick={() => {
                    setIconMode("auto");
                    setClearCustomIcon(true);
                    setCustomIconPath(undefined);
                  }}
                  class={`rounded-2xl border px-4 py-2 text-sm transition ${
                    iconMode() === "auto"
                      ? "border-white/24 bg-white text-slate-900"
                      : "border-white/10 text-white/65 hover:bg-white/10"
                  }`}
                >
                  Use Auto Icon
                </button>
                <button
                  type="button"
                  onClick={pickIcon}
                  class={`rounded-2xl border px-4 py-2 text-sm transition ${
                    iconMode() === "custom"
                      ? "border-white/16 bg-white/12 text-white"
                      : "border-white/10 text-white/65 hover:bg-white/10"
                  }`}
                >
                  Choose Custom Icon
                </button>
                <Show when={iconMode() === "custom"}>
                  <span class="truncate text-xs text-white/46">
                    {customIconPath()
                      ? customIconPath()
                      : props.item?.iconSource === "custom"
                        ? "Using current custom icon"
                        : "Choose an image file"}
                  </span>
                </Show>
              </div>
            </Show>
          </div>

          <div class="mt-6 flex items-center justify-between">
            <Show when={props.mode === "edit" && props.item && props.onDelete}>
              <button
                type="button"
                onClick={() => props.item && props.onDelete?.(props.item)}
                class="rounded-2xl border border-rose-400/18 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/16"
              >
                Delete Item
              </button>
            </Show>
            <div class="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={props.onClose}
                class="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/65 transition hover:bg-white/8"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  props.onSave({
                    name: name().trim(),
                    target: target().trim(),
                    groupId: groupId(),
                    customIconPath:
                      iconMode() === "custom" ? customIconPath() : undefined,
                    clearCustomIcon:
                      iconMode() === "auto"
                        ? clearCustomIcon() || props.item?.iconSource === "custom"
                        : false,
                  })
                }
                class="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-[0_12px_28px_rgba(255,255,255,0.18)]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}

interface FieldProps {
  label: string;
  children: any;
}

function Field(props: FieldProps) {
  return (
    <label class="flex flex-col gap-2 text-sm text-white/62">
      <span class="uppercase tracking-[0.22em] text-[11px] text-white/36">
        {props.label}
      </span>
      {props.children}
    </label>
  );
}
