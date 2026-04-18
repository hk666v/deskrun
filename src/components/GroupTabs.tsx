import { For } from "solid-js";
import type { Group } from "../types";

interface GroupTabsProps {
  groups: Group[];
  currentGroupId: string | null;
  onSelect: (groupId: string | null) => void;
}

export function GroupTabs(props: GroupTabsProps) {
  return (
    <div class="flex items-center gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => props.onSelect(null)}
        class={`rounded-full px-4 py-2 text-sm font-medium transition ${
          props.currentGroupId === null
            ? "bg-white text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.2)]"
            : "bg-white/10 text-white/62 hover:bg-white/16 hover:text-white"
        }`}
      >
        All
      </button>
      <For each={props.groups}>
        {(group) => (
          <button
            type="button"
            onClick={() => props.onSelect(group.id)}
            class={`rounded-full px-4 py-2 text-sm font-medium transition ${
              props.currentGroupId === group.id
                ? "bg-white text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.2)]"
                : "bg-white/10 text-white/62 hover:bg-white/16 hover:text-white"
            }`}
          >
            {group.name}
          </button>
        )}
      </For>
    </div>
  );
}
