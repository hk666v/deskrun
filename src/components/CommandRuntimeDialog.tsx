import { Show, createEffect } from "solid-js";
import type { LaunchItem } from "../types";

interface CommandRuntimeDialogProps {
  open: boolean;
  item: LaunchItem | null;
  value: string;
  onInput: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CommandRuntimeDialog(props: CommandRuntimeDialogProps) {
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (!props.open) {
      return;
    }

    window.setTimeout(() => {
      inputRef?.focus();
      inputRef?.select();
    }, 0);
  });

  return (
    <Show when={props.open && props.item}>
      <div class="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/30 backdrop-blur-sm">
        <div class="w-[460px] rounded-[28px] border border-white/14 bg-[linear-gradient(180deg,rgba(10,18,30,0.96),rgba(12,22,35,0.9))] p-6 shadow-[0_28px_80px_rgba(4,10,20,0.4)]">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold text-white">Launch CMD Item</h2>
              <p class="mt-1 text-sm text-white/46">
                Enter the runtime target for <span class="text-white/78">{props.item?.name}</span>.
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
            <label class="flex flex-col gap-2 text-sm text-white/62">
              <span class="text-[11px] uppercase tracking-[0.22em] text-white/36">
                Target
              </span>
              <input
                ref={inputRef}
                value={props.value}
                onInput={(event) => props.onInput(event.currentTarget.value)}
                class="field-input"
                placeholder="https://example.com"
              />
            </label>

            <div class="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3">
              <div class="text-[10px] uppercase tracking-[0.16em] text-white/26">
                Template
              </div>
              <div class="mt-2 text-sm text-white/58">
                {props.item?.runtimeArgsTemplate ?? "{target}"}
              </div>
            </div>
          </div>

          <div class="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={props.onClose}
              class="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/65 transition hover:bg-white/8"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!props.value.trim()}
              onClick={props.onSubmit}
              class="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-[0_12px_28px_rgba(255,255,255,0.18)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Launch
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
