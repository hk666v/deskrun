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
      <div class="flex min-w-0 flex-1 items-center gap-3 rounded-[26px] border border-white/8 bg-[#161820] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:bg-[#1C1F2A]">
        <div class="flex min-w-0 flex-1 flex-col">
          <label class="text-[11px] uppercase tracking-[0.24em] text-white/38">
            Search your launcher
          </label>
          <input
            ref={props.inputRef}
            value={props.query}
            onInput={props.onInput}
            placeholder="Search apps, folders, commands, or URLs"
            class="mt-1 w-full bg-transparent text-base text-white outline-none placeholder:text-white/28"
          />
        </div>
        <div class="rounded-full border border-white/8 bg-[#0F1117] px-3 py-1 text-xs text-white/42">
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
          ? "border-white/12 bg-[#1C1F2A] text-white shadow-[0_12px_30px_rgba(0,0,0,0.22)] hover:bg-[#232735]"
          : "border-white/8 bg-[#161820] text-white/78 hover:bg-[#1C1F2A] hover:text-white/92"
      }`}
    >
      {props.children}
    </button>
  );
}
