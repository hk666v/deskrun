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
  const rowColumns = "grid-cols-[18px_minmax(0,1fr)_86px_46px_72px]";

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
        (candidate) => props.selectedIds.includes(candidate.id) && !candidate.alreadyExists,
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
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-white/8 bg-[#161820] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div class="rounded-[22px] border border-white/8 bg-[#0F1117] p-3.5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-[11px] uppercase tracking-[0.22em] text-white/32">
              App Discovery
            </div>
            <h2 class="mt-0.5 text-[17px] font-semibold text-white">Find installed apps</h2>
            <p class="mt-1 max-w-2xl text-[12px] leading-5 text-white/42">
              Scan Start Menu shortcuts, desktop shortcuts, and installed app registry
              entries, then import the ones you want into DeskRun.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <ToggleChip
              label="Hide existing"
              checked={props.hideExisting}
              onChange={props.onSetHideExisting}
            />

            <button
              type="button"
              disabled={props.busy}
              onClick={props.onScan}
              class="rounded-2xl border border-white/10 bg-transparent px-3.5 py-2.5 text-sm font-medium text-white/78 transition hover:bg-[#1C1F2A] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {props.busy ? "Scanning..." : "Scan Apps"}
            </button>

            <button
              type="button"
              disabled={props.busy || importableCount() === 0}
              onClick={props.onImportSelected}
              class="rounded-2xl border border-[#2563EB] bg-[#2563EB] px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.28)] transition hover:bg-[#3B82F6] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Import Selected ({importableCount()})
            </button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <SourceChip
            label="Start Menu"
            checked={props.scanOptions.startMenu}
            onChange={(checked) =>
              props.onSetScanOptions({ ...props.scanOptions, startMenu: checked })
            }
          />
          <SourceChip
            label="Desktop"
            checked={props.scanOptions.desktop}
            onChange={(checked) =>
              props.onSetScanOptions({ ...props.scanOptions, desktop: checked })
            }
          />
          <SourceChip
            label="Registry"
            checked={props.scanOptions.registry}
            onChange={(checked) =>
              props.onSetScanOptions({ ...props.scanOptions, registry: checked })
            }
          />
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2.5">
          <label class="flex min-w-[220px] flex-1 items-center gap-3 rounded-[16px] border border-white/8 bg-[#161820] px-3 py-2">
            <span class="text-[11px] uppercase tracking-[0.18em] text-white/28">Search</span>
            <input
              value={props.searchQuery}
              onInput={(event) => props.onSearchQueryChange(event.currentTarget.value)}
              placeholder="Filter discovered apps"
              class="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/28"
            />
          </label>

          <label class="flex items-center gap-2 rounded-full border border-white/8 bg-[#161820] px-3 py-1.5 text-xs text-white/64">
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

          <div class="rounded-full border border-white/8 bg-[#161820] px-3 py-1.5 text-xs text-white/46">
            {visibleSelectionSummary().visibleCount} visible /{" "}
            {visibleSelectionSummary().selectedVisibleCount} selected
          </div>
        </div>

        <Show when={props.error}>
          <div class="mt-4 rounded-[16px] border border-rose-300/14 bg-rose-400/10 px-3 py-2 text-sm leading-6 text-rose-50/82">
            {props.error}
          </div>
        </Show>
      </div>

      <div class="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        <Show
          when={filteredCandidates().length > 0}
          fallback={
            <div class="flex min-h-full items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-[#0F1117] px-6 text-center text-sm leading-7 text-white/42">
              Run a scan to load candidates here. After that you can review, filter, and import
              them directly from this view.
            </div>
          }
        >
          <div class="flex min-h-0 flex-col gap-1.5">
            <div class={`sticky top-0 z-10 grid ${rowColumns} items-center gap-3 rounded-[14px] bg-[#161820] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32`}>
              <div />
              <div>Name</div>
              <div class="w-[86px] text-left">Source</div>
              <div class="w-[46px] text-left">Priority</div>
              <div class="w-[72px] text-left">Action</div>
            </div>
            <For each={filteredCandidates()}>
              {(candidate) => (
                <label class={`grid ${rowColumns} items-center gap-3 rounded-[16px] border border-white/8 bg-[#161820] px-3 py-2 transition hover:bg-[#1C1F2A]`}>
                  <input
                    type="checkbox"
                    checked={props.selectedIds.includes(candidate.id)}
                    disabled={candidate.alreadyExists}
                    onChange={(event) =>
                      props.onToggleSelected(candidate.id, event.currentTarget.checked)
                    }
                    class="h-4 w-4 shrink-0 accent-white"
                  />

                  <div class="min-w-0">
                    <div class="flex min-w-0 items-center gap-2">
                      <div class="truncate text-[13px] font-medium text-white/92">
                        {candidate.name}
                      </div>
                      <KindMeta kind={candidate.kind} />
                    </div>
                    <div
                      class="truncate font-mono text-[11px] leading-4 text-white/34"
                      title={candidate.target}
                    >
                      {candidate.target}
                    </div>
                  </div>

                  <div class="w-[86px]">
                    <SourceMeta>{formatSourceLabel(candidate.source)}</SourceMeta>
                  </div>

                  <div class="w-[46px]">
                    <ConfidenceMeta confidence={candidate.confidence} />
                  </div>

                  <div class="w-[72px]">
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
                        class="w-[72px] rounded-full border border-[#2563EB]/36 bg-[#2563EB]/14 px-0 py-1.5 text-center text-[9px] font-semibold uppercase tracking-[0.04em] text-[#93C5FD] transition hover:bg-[#2563EB]/22 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Import
                      </button>
                    </Show>
                    <Show when={candidate.alreadyExists}>
                      <span class="inline-flex w-[72px] items-center justify-center rounded-full border border-sky-200/10 px-0 py-1.5 text-[9px] uppercase tracking-[0.04em] text-sky-100/58">
                        Existing
                      </span>
                    </Show>
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

interface SourceChipProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function SourceChip(props: SourceChipProps) {
  return (
    <label
      class={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        props.checked
          ? "border-[#2563EB]/30 bg-[#2563EB]/14 text-[#BFDBFE]"
          : "border-white/8 bg-[#161820] text-white/58 hover:bg-[#1C1F2A] hover:text-white/76"
      }`}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        class="sr-only"
      />
      {props.label}
    </label>
  );
}

interface ToggleChipProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleChip(props: ToggleChipProps) {
  return (
    <label
      class={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs transition ${
        props.checked
          ? "border-white/12 bg-[#1C1F2A] text-white/86"
          : "border-white/8 bg-[#161820] text-white/58 hover:bg-[#1C1F2A] hover:text-white/78"
      }`}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        class="sr-only"
      />
      {props.label}
    </label>
  );
}

interface SourceMetaProps {
  children: string;
}

function SourceMeta(props: SourceMetaProps) {
  return (
    <span class="inline-flex w-[86px] items-center justify-center rounded-full border border-white/8 px-0 py-1 text-[10px] uppercase tracking-[0.12em] text-white/40">
      {props.children}
    </span>
  );
}

interface KindMetaProps {
  kind: DiscoveryCandidate["kind"];
}

function KindMeta(props: KindMetaProps) {
  const tone =
    props.kind === "link"
      ? "border-[#694013] bg-[#2A1A07] text-[#FBBF24]"
      : "border-[#1A417A] bg-[#0D1E35] text-[#60A5FA]";

  return (
    <span class={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${tone}`}>
      {props.kind}
    </span>
  );
}

interface ConfidenceMetaProps {
  confidence: DiscoveryCandidate["confidence"];
}

function ConfidenceMeta(props: ConfidenceMetaProps) {
  const tone =
    props.confidence === "high"
      ? "bg-emerald-500/14 text-emerald-300"
      : props.confidence === "medium"
        ? "bg-amber-500/14 text-amber-300"
        : "bg-rose-500/14 text-rose-300";

  return (
    <span class={`inline-flex w-[46px] items-center justify-center rounded-full px-0 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone}`}>
      {props.confidence}
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
