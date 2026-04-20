import { For } from "solid-js";
import type { Group } from "../types";

interface GroupTabsProps {
  groups: Group[];
  currentGroupId: string | null;
  discoveryCount: number;
  onSelect: (groupId: string | null) => void;
}

export function GroupTabs(props: GroupTabsProps) {
  return (
    <div class="flex min-w-0 items-center gap-3 rounded-[22px] border border-white/10 bg-black/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div class="shrink-0 px-1 text-[10px] uppercase tracking-[0.22em] text-white/28">
        Views
      </div>

      <div class="min-w-0 flex-1 overflow-x-auto">
        <div class="flex w-max items-center gap-2 pr-1">
          <button
            type="button"
            onClick={() => props.onSelect(null)}
            class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              props.currentGroupId === null
                ? "border-white/24 bg-white text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
                : "border-transparent bg-white/[0.04] text-white/52 hover:bg-white/[0.08] hover:text-white/82"
            }`}
          >
            My Library
          </button>
          <button
            type="button"
            onClick={() => props.onSelect("__favorites__")}
            class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              props.currentGroupId === "__favorites__"
                ? "border-white/24 bg-white text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
                : "border-transparent bg-white/[0.04] text-white/52 hover:bg-white/[0.08] hover:text-white/82"
            }`}
          >
            Favorites
          </button>
          <button
            type="button"
            onClick={() => props.onSelect("__recent__")}
            class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              props.currentGroupId === "__recent__"
                ? "border-white/24 bg-white text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
                : "border-transparent bg-white/[0.04] text-white/52 hover:bg-white/[0.08] hover:text-white/82"
            }`}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => props.onSelect("__discovery__")}
            class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              props.currentGroupId === "__discovery__"
                ? "border-white/24 bg-white text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
                : "border-transparent bg-white/[0.04] text-white/52 hover:bg-white/[0.08] hover:text-white/82"
            }`}
          >
            {props.discoveryCount > 0 ? `Discovery (${props.discoveryCount})` : "Discovery"}
          </button>
          <For each={props.groups}>
            {(group) => (
              <button
                type="button"
                onClick={() => props.onSelect(group.id)}
                class={`max-w-[180px] shrink-0 truncate rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                  props.currentGroupId === group.id
                    ? "border-white/24 bg-white text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
                    : "border-transparent bg-white/[0.04] text-white/52 hover:bg-white/[0.08] hover:text-white/82"
                }`}
                title={group.name}
              >
                {group.name}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
