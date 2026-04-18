import type { JSX } from "solid-js";

interface SearchBarProps {
  query: string;
  hotkey: string;
  inputRef?: (element: HTMLInputElement) => void;
  onInput: JSX.EventHandler<HTMLInputElement, InputEvent>;
  onAddApp: () => void;
  onAddFolder: () => void;
  onAddUrl: () => void;
  onAddCommand: () => void;
  onOpenSettings: () => void;
}

export function SearchBar(props: SearchBarProps) {
  return (
    <div class="flex items-center gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-3 rounded-[26px] border border-white/18 bg-white/12 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.32)]">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-black/10 text-[11px] font-semibold tracking-[0.22em] text-white/65">
          RUN
        </div>
        <div class="flex min-w-0 flex-1 flex-col">
          <label class="text-[11px] uppercase tracking-[0.24em] text-white/40">
            Search your launcher
          </label>
          <input
            ref={props.inputRef}
            value={props.query}
            onInput={props.onInput}
            placeholder="搜索你已经添加的应用、目录或网址"
            class="mt-1 w-full bg-transparent text-base text-white outline-none placeholder:text-white/32"
          />
        </div>
        <div class="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs text-white/45">
          {props.hotkey}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <ActionButton onClick={props.onAddApp}>+ App</ActionButton>
        <ActionButton onClick={props.onAddFolder}>+ Folder</ActionButton>
        <ActionButton onClick={props.onAddUrl}>+ URL</ActionButton>
        <ActionButton onClick={props.onAddCommand}>+ CMD</ActionButton>
        <ActionButton emphasis onClick={props.onOpenSettings}>
          Settings
        </ActionButton>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  children: JSX.Element;
  emphasis?: boolean;
  onClick: () => void;
}

function ActionButton(props: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
        props.emphasis
          ? "border-white/40 bg-white text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.22)]"
          : "border-white/18 bg-white/12 text-white/82 hover:bg-white/18"
      }`}
    >
      {props.children}
    </button>
  );
}
