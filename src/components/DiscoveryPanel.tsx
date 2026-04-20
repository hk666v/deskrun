import { For, Show, createEffect, createMemo } from "solid-js";
import type { DiscoveryCandidate, DiscoveryScanOptions } from "../types";

interface DiscoveryPanelProps {
  busy: boolean;
  error: string;
  candidates: DiscoveryCandidate[];
  selectedIds: string[];
  searchQuery: string;
  hideExisting: boolean;
  scanOptions: DiscoveryScanOptions;
  onSearchQueryChange: (value: string) => void;
  onSetHideExisting: (value: boolean) => void;
  onSetScanOptions: (next: DiscoveryScanOptions) => void;
  onToggleAllVisible: (candidateIds: string[], checked: boolean) => void;
  onToggleSelected: (candidateId: string, checked: boolean) => void;
  onImportOne: (candidate: Pick<DiscoveryCandidate, "name" | "kind" | "target">) => void;
  onScan: () => void;
  onImportSelected: () => void;
}

export function DiscoveryPanel(props: DiscoveryPanelProps) {
  let selectAllRef!: HTMLInputElement;

  const filteredCandidates = createMemo(() => {
    const term = props.searchQuery.trim().toLowerCase();
    return props.candidates.filter((candidate) => {
      if (props.hideExisting && candidate.alreadyExists) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        candidate.name,
        candidate.target,
        candidate.source,
        candidate.confidence,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  });

  const importableCount = createMemo(
    () =>
      props.candidates.filter(
        (candidate) =>
          props.selectedIds.includes(candidate.id) && !candidate.alreadyExists,
      ).length,
  );

  const selectableCandidateIds = createMemo(() =>
    filteredCandidates()
      .filter((candidate) => !candidate.alreadyExists)
      .map((candidate) => candidate.id),
  );

  const allVisibleSelected = createMemo(() => {
    const selectableIds = selectableCandidateIds();
    return (
      selectableIds.length > 0 &&
      selectableIds.every((candidateId) => props.selectedIds.includes(candidateId))
    );
  });

  const someVisibleSelected = createMemo(() => {
    const selectableIds = selectableCandidateIds();
    return selectableIds.some((candidateId) => props.selectedIds.includes(candidateId));
  });

  const visibleSelectionSummary = createMemo(() => {
    const selectableIds = selectableCandidateIds();
    const selectedVisibleCount = selectableIds.filter((candidateId) =>
      props.selectedIds.includes(candidateId),
    ).length;

    return {
      visibleCount: filteredCandidates().length,
      selectedVisibleCount,
      selectableVisibleCount: selectableIds.length,
    };
  });

  createEffect(() => {
    if (selectAllRef) {
      selectAllRef.indeterminate = !allVisibleSelected() && someVisibleSelected();
    }
  });

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
      <div class="rounded-[22px] border border-white/10 bg-black/10 p-4">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-[11px] uppercase tracking-[0.22em] text-white/34">
              App Discovery
            </div>
            <h2 class="mt-1 text-lg font-semibold text-white">Find installed apps</h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-white/46">
              Scan Start Menu shortcuts, desktop shortcuts, and installed app registry
              entries, then import the ones you want into DeskRun.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/68">
              <input
                type="checkbox"
                checked={props.hideExisting}
                onChange={(event) => props.onSetHideExisting(event.currentTarget.checked)}
                class="h-4 w-4 accent-white"
              />
              Hide existing
            </label>

            <button
              type="button"
              disabled={props.busy}
              onClick={props.onImportSelected}
              class="rounded-2xl border border-white/14 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white/82 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Import Selected ({importableCount()})
            </button>

            <button
              type="button"
              disabled={
                props.busy ||
                (!props.scanOptions.startMenu &&
                  !props.scanOptions.desktop &&
                  !props.scanOptions.registry)
              }
              onClick={props.onScan}
              class="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {props.busy ? "Scanning..." : "Scan Apps"}
            </button>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <SourcePill
            label="Start Menu"
            checked={props.scanOptions.startMenu}
            onChange={(checked) =>
              props.onSetScanOptions({ ...props.scanOptions, startMenu: checked })
            }
          />
          <SourcePill
            label="Desktop"
            checked={props.scanOptions.desktop}
            onChange={(checked) =>
              props.onSetScanOptions({ ...props.scanOptions, desktop: checked })
            }
          />
          <SourcePill
            label="Registry"
            checked={props.scanOptions.registry}
            onChange={(checked) =>
              props.onSetScanOptions({ ...props.scanOptions, registry: checked })
            }
          />
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <label class="flex min-w-[220px] flex-1 items-center gap-3 rounded-[18px] border border-white/10 bg-black/10 px-3 py-2.5">
            <span class="text-[11px] uppercase tracking-[0.18em] text-white/30">Search</span>
            <input
              value={props.searchQuery}
              onInput={(event) => props.onSearchQueryChange(event.currentTarget.value)}
              placeholder="Filter discovered apps"
              class="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/28"
            />
          </label>

          <label class="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/68">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected()}
              onChange={(event) =>
                props.onToggleAllVisible(selectableCandidateIds(), event.currentTarget.checked)
              }
              class="h-4 w-4 accent-white"
            />
            <span>Select all visible</span>
          </label>

          <div class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/52">
            {visibleSelectionSummary().visibleCount} visible / {visibleSelectionSummary().selectedVisibleCount} selected
          </div>
        </div>

        <Show when={props.error}>
          <div class="mt-4 rounded-[16px] border border-rose-300/14 bg-rose-400/10 px-3 py-2 text-sm leading-6 text-rose-50/82">
            {props.error}
          </div>
        </Show>
      </div>

      <div class="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        <Show
          when={filteredCandidates().length > 0}
          fallback={
            <div class="flex min-h-full items-center justify-center rounded-[24px] border border-dashed border-white/14 bg-black/10 px-6 text-center text-sm leading-7 text-white/42">
              Run a scan to load candidates here. After that you can review, filter, and import
              them directly from this view.
            </div>
          }
        >
          <div class="flex min-h-0 flex-col gap-3">
            <For each={filteredCandidates()}>
              {(candidate) => (
                <label class="flex items-start gap-3 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] px-4 py-3 transition hover:border-white/18 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))]">
                  <input
                    type="checkbox"
                    checked={props.selectedIds.includes(candidate.id)}
                    disabled={candidate.alreadyExists}
                    onChange={(event) =>
                      props.onToggleSelected(candidate.id, event.currentTarget.checked)
                    }
                    class="mt-0.5 h-4 w-4 shrink-0 accent-white"
                  />

                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="truncate text-[15px] font-semibold text-white">
                          {candidate.name}
                        </div>
                        <div class="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/28">
                          {candidate.kind}
                        </div>
                      </div>

                      <div class="flex flex-wrap items-center gap-1.5">
                        <DiscoveryPill>{formatSourceLabel(candidate.source)}</DiscoveryPill>
                        <DiscoveryPill>{candidate.confidence}</DiscoveryPill>
                        <Show when={candidate.alreadyExists}>
                          <DiscoveryPill tone="existing">Existing</DiscoveryPill>
                        </Show>
                        <Show when={!candidate.alreadyExists}>
                          <button
                            type="button"
                            disabled={props.busy}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              props.onImportOne({
                                name: candidate.name,
                                kind: candidate.kind,
                                target: candidate.target,
                              });
                            }}
                            class="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/74 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Import
                          </button>
                        </Show>
                      </div>
                    </div>

                    <div class="mt-3 break-all rounded-[16px] border border-white/8 bg-black/12 px-3 py-2.5 text-xs leading-6 text-white/54">
                      {candidate.target}
                    </div>
                  </div>
                </label>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

interface SourcePillProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function SourcePill(props: SourcePillProps) {
  return (
    <label class="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        class="h-4 w-4 accent-white"
      />
      <span>{props.label}</span>
    </label>
  );
}

interface DiscoveryPillProps {
  children: string;
  tone?: "default" | "existing";
}

function DiscoveryPill(props: DiscoveryPillProps) {
  return (
    <span
      class={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${
        props.tone === "existing"
          ? "border-sky-200/16 bg-sky-300/10 text-sky-100/72"
          : "border-white/10 bg-white/[0.04] text-white/42"
      }`}
    >
      {props.children}
    </span>
  );
}

function formatSourceLabel(source: DiscoveryCandidate["source"]) {
  switch (source) {
    case "start_menu":
      return "Start Menu";
    case "desktop":
      return "Desktop";
    case "registry":
      return "Registry";
  }
}
