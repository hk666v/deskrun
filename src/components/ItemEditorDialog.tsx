import { Show, createEffect, createSignal } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import type { Group, LaunchItem } from "../types";
import { flattenGroups } from "../lib/group-tree";

interface ItemEditorDialogProps {
  open: boolean;
  mode: "create-url" | "create-command" | "edit";
  item: LaunchItem | null;
  groups: Group[];
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onDelete?: (item: LaunchItem) => void;
  onSave: (payload: {
    name: string;
    target: string;
    command?: string;
    note?: string | null;
    fixedArgs?: string | null;
    runtimeArgs?: string | null;
    workingDir?: string | null;
    keepOpen?: boolean;
    runAsAdmin?: boolean;
    groupId: string | null;
    customIconPath?: string;
    clearCustomIcon?: boolean;
  }) => void | Promise<void>;
}

export function ItemEditorDialog(props: ItemEditorDialogProps) {
  const [name, setName] = createSignal("");
  const [target, setTarget] = createSignal("");
  const [note, setNote] = createSignal("");
  const [fixedArgs, setFixedArgs] = createSignal("");
  const [runtimeArgs, setRuntimeArgs] = createSignal("");
  const [workingDir, setWorkingDir] = createSignal("");
  const [keepOpen, setKeepOpen] = createSignal(false);
  const [runAsAdmin, setRunAsAdmin] = createSignal(false);
  const [groupId, setGroupId] = createSignal<string | null>(null);
  const [iconMode, setIconMode] = createSignal<"auto" | "custom">("auto");
  const [customIconPath, setCustomIconPath] = createSignal<string>();
  const [clearCustomIcon, setClearCustomIcon] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal("");
  let nameInput: HTMLInputElement | undefined;

  const isCommandMode = () =>
    props.mode === "create-command" || props.item?.kind === "command";

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const item = props.item;
    setName(item?.name ?? "");
    setTarget(
      props.mode === "create-url"
        ? item?.target ?? "https://"
        : isCommandMode()
          ? item?.command ?? item?.target ?? ""
          : item?.target ?? "",
    );
    setNote(item?.note ?? "");
    setFixedArgs(item?.fixedArgs ?? "");
    setRuntimeArgs(item?.runtimeArgs ?? "");
    setWorkingDir(item?.workingDir ?? "");
    setKeepOpen(item?.keepOpen ?? false);
    setRunAsAdmin(item?.runAsAdmin ?? false);
    setGroupId(item?.groupId ?? null);
    setIconMode(item?.iconSource === "custom" ? "custom" : "auto");
    setCustomIconPath(undefined);
    setClearCustomIcon(false);
    setSaveError("");
    setSaving(false);

    // Put the caret where the user is most likely to start typing, so the first
    // keystroke lands in the dialog rather than on the launcher behind it.
    window.setTimeout(() => nameInput?.focus(), 0);
  });

  const submit = async () => {
    if (name().trim().length === 0 || saving()) {
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      await props.onSave({
        name: name().trim(),
        target: target().trim(),
        command: isCommandMode() ? target().trim() : undefined,
        note: note().trim() || null,
        fixedArgs: isCommandMode() ? fixedArgs().trim() || null : undefined,
        runtimeArgs: isCommandMode() ? runtimeArgs().trim() || null : undefined,
        workingDir: isCommandMode() ? workingDir().trim() || null : undefined,
        keepOpen: isCommandMode() ? keepOpen() : undefined,
        runAsAdmin: runAsAdmin(),
        groupId: groupId(),
        customIconPath: iconMode() === "custom" ? customIconPath() : undefined,
        clearCustomIcon:
          iconMode() === "auto"
            ? clearCustomIcon() || props.item?.iconSource === "custom"
            : false,
      });
    } catch (error) {
      // Stay open and say what went wrong. This used to fail silently — the
      // button appeared to do nothing at all, so the user just kept clicking.
      setSaveError(
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : String(error),
      );
    } finally {
      setSaving(false);
    }
  };

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

  const iconModeButtonClass = (active: boolean) =>
    `rounded-sharp border px-3 py-1.5 text-label transition-colors duration-100 ${
      active
        ? "border-signal-line bg-signal-soft text-signal"
        : "border-line text-fg-muted hover:bg-fill hover:text-fg"
    }`;

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-scrim flex animate-fade-in items-center justify-center rounded-window bg-scrim">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-editor-title"
          class="flex max-h-[calc(100vh-32px)] w-[min(520px,calc(100vw-32px))] animate-pop-in flex-col overflow-hidden rounded-panel border border-line bg-raised shadow-overlay"
        >
          <div class="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
            <div class="min-w-0">
              <h2 id="item-editor-title" class="text-title font-semibold text-fg">
                {props.mode === "create-url"
                  ? "Add URL"
                  : props.mode === "create-command"
                    ? "Add CMD Command"
                    : "Edit Launcher Item"}
              </h2>
              <p class="mt-1 text-label text-fg-subtle">
                {props.mode === "create-url"
                  ? "Create a website shortcut for quick launch."
                  : isCommandMode()
                    ? "Run a command through cmd.exe, with an optional working directory."
                    : "Adjust the name, target, group, and custom icon."}
              </p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close"
              title="Close"
              class="shrink-0 rounded-sharp px-2 py-1 text-label text-fg-subtle transition-colors duration-100 hover:bg-fill hover:text-fg"
            >
              ✕
            </button>
          </div>

          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Field label="Name">
              <input
                ref={nameInput}
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
                class="field-input"
                placeholder="Chrome, Workspace, Docs"
              />
            </Field>

            <Field
              label={
                props.mode === "create-url"
                  ? "URL"
                  : isCommandMode()
                    ? "Command"
                    : "Target"
              }
            >
              <input
                value={target()}
                onInput={(event) => setTarget(event.currentTarget.value)}
                class="field-input"
                placeholder={
                  props.mode === "create-url"
                    ? "https://example.com"
                    : isCommandMode()
                      ? "npm run dev"
                      : "C:\\Program Files\\App\\app.exe"
                }
              />
            </Field>

            <Field label="Note">
              <textarea
                value={note()}
                onInput={(event) => setNote(event.currentTarget.value)}
                class="field-input min-h-[80px] resize-y leading-6"
                placeholder="Explain what this item does, what the parameters mean, or any usage tips."
              />
            </Field>

            <Show when={isCommandMode()}>
              <>
                <Field label="Fixed args">
                  <input
                    value={fixedArgs()}
                    onInput={(event) => setFixedArgs(event.currentTarget.value)}
                    class="field-input"
                    placeholder="-silent -threads 50"
                  />
                </Field>

                <Field label="Runtime args">
                  <input
                    value={runtimeArgs()}
                    onInput={(event) => setRuntimeArgs(event.currentTarget.value)}
                    class="field-input"
                    placeholder="-u https://example.com -proxy http://127.0.0.1:8080"
                  />
                  <p class="text-meta text-fg-subtle">
                    Saved runtime arguments are appended after the fixed args when this
                    item launches.
                  </p>
                </Field>

                <Field label="Working directory">
                  <input
                    value={workingDir()}
                    onInput={(event) => setWorkingDir(event.currentTarget.value)}
                    class="field-input"
                    placeholder="C:\\Projects\\my-app"
                  />
                </Field>

                <label class="flex items-center justify-between gap-3 rounded-sharp border border-line px-3 py-2 text-label text-fg-muted">
                  <span>Keep CMD window open</span>
                  <input
                    type="checkbox"
                    checked={keepOpen()}
                    onChange={(event) => setKeepOpen(event.currentTarget.checked)}
                    class="h-3.5 w-3.5 accent-signal"
                  />
                </label>
              </>
            </Show>

            {/* Elevating a browser is meaningless, so URL items are left out. */}
            <Show when={props.mode !== "create-url" && props.item?.kind !== "url"}>
              <label class="flex items-center justify-between gap-3 rounded-sharp border border-line px-3 py-2 text-label text-fg-muted">
                <span class="min-w-0">
                  Run as administrator
                  <span class="mt-0.5 block text-meta text-fg-subtle">
                    Windows asks for permission every time.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={runAsAdmin()}
                  onChange={(event) => setRunAsAdmin(event.currentTarget.checked)}
                  class="h-3.5 w-3.5 shrink-0 accent-signal"
                />
              </label>
            </Show>

            <Field label="Group">
              <select
                value={groupId() ?? ""}
                onChange={(event) => setGroupId(event.currentTarget.value || null)}
                class="field-input field-select"
              >
                <option value="">Ungrouped</option>
                {/* Indented rather than sorted flat: a group inside another one
                    has to look like it, or the two levels read as one long list
                    of names that happen to be in a strange order. */}
                {flattenGroups(props.groups, () => true).map((row) => (
                  <option value={row.group.id}>
                    {`${"　".repeat(row.depth)}${row.group.name}`}
                  </option>
                ))}
              </select>
            </Field>

            <Show when={props.mode === "edit" && props.item?.kind !== "command"}>
              <div class="flex flex-wrap items-center gap-2 rounded-sharp border border-line p-3">
                <button
                  type="button"
                  onClick={() => {
                    setIconMode("auto");
                    setClearCustomIcon(true);
                    setCustomIconPath(undefined);
                  }}
                  class={iconModeButtonClass(iconMode() === "auto")}
                >
                  Use auto icon
                </button>
                <button
                  type="button"
                  onClick={pickIcon}
                  class={iconModeButtonClass(iconMode() === "custom")}
                >
                  Choose custom icon
                </button>
                <Show when={iconMode() === "custom"}>
                  <span class="min-w-0 truncate font-mono text-meta text-fg-subtle">
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

          <Show when={saveError()}>
            <div
              role="alert"
              class="border-t border-danger-soft px-4 py-2 text-label text-danger"
            >
              {saveError()}
            </div>
          </Show>

          <div class="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
            <Show when={props.mode === "edit" && props.item && props.onDelete}>
              <button
                type="button"
                onClick={() => props.item && props.onDelete?.(props.item)}
                class="rounded-sharp border border-danger-soft px-3 py-1.5 text-label text-danger transition-colors duration-100 hover:bg-danger-soft"
              >
                Delete item
              </button>
            </Show>
            <div class="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={props.onClose}
                class="rounded-sharp border border-line px-3 py-1.5 text-label text-fg-muted transition-colors duration-100 hover:bg-fill hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={name().trim().length === 0 || saving()}
                onClick={submit}
                class="rounded-sharp bg-signal px-4 py-1.5 text-label font-semibold text-canvas transition-opacity duration-100 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving() ? "Saving…" : "Save"}
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
    <label class="flex flex-col gap-1.5">
      <span class="text-meta text-fg-subtle">{props.label}</span>
      {props.children}
    </label>
  );
}
