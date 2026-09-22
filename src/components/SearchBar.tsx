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
    <div class="flex items-center gap-4 border-b border-line pb-3">
      <input
        ref={props.inputRef}
        value={props.query}
        onInput={props.onInput}
        placeholder="Search apps, folders, commands, or URLs"
        class="min-w-0 flex-1 bg-transparent text-title text-fg outline-none placeholder:text-fg-faint"
      />

      <div class="shrink-0 rounded-sharp border border-line bg-inset px-2 py-1 font-mono text-data text-fg-subtle">
        {props.hotkey}
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <ActionButton onClick={props.onAddApp}>+ App</ActionButton>
        <ActionButton onClick={props.onAddFolder}>+ Folder</ActionButton>
        <ActionButton onClick={props.onAddUrl}>+ URL</ActionButton>
        <ActionButton onClick={props.onAddCommand}>+ CMD</ActionButton>

        <div class="mx-1 h-4 w-px bg-line" />

        <ActionButton onClick={props.onOpenSettings}>Settings</ActionButton>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  children: JSX.Element;
  onClick: () => void;
}

function ActionButton(props: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="rounded-sharp px-2 py-1 text-label text-fg-muted transition-colors duration-100 hover:bg-fill hover:text-fg"
    >
      {props.children}
    </button>
  );
}
