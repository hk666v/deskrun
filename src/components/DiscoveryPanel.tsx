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
  onScan: () => void;
  onImportSelected: () => void;
}

export function DiscoveryPanel(props: DiscoveryPanelProps) {
  let selectAllRef!: HTMLInputElement;
  // Selection is the only per-row action, so there is no action column and the
  // row itself is the toggle target.
  const rowColumns = "grid-cols-[16px_minmax(0,1fr)_88px_52px]";

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

  const emptyMessage = () => {
    if (props.candidates.length === 0) {
      return "Run a scan to load candidates here. After that you can review, filter, and import them directly from this view.";
    }

    const term = props.searchQuery.trim();
    if (term.length > 0) {
      return `No discovered apps match “${term}”.`;
    }

    return "Every discovered app is already in your library. Turn off “Hide existing” to see them.";
  };

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface p-3">
      <div class="shrink-0">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-title font-semibold text-fg">Find installed apps</h2>
            <p class="mt-1 max-w-2xl text-label text-fg-subtle">
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
              class="rounded-sharp border border-line px-3 py-1.5 text-label text-fg-muted transition-colors duration-100 hover:bg-fill hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
            >
              {props.busy ? "Scanning…" : "Scan apps"}
            </button>

            <button
              type="button"
              disabled={props.busy || importableCount() === 0}
              onClick={props.onImportSelected}
              class="rounded-sharp bg-signal px-3 py-1.5 text-label font-semibold text-canvas transition-opacity duration-100 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Import selected ({importableCount()})
            </button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-1">
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

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={props.searchQuery}
            onInput={(event) => props.onSearchQueryChange(event.currentTarget.value)}
            placeholder="Filter discovered apps"
            class="field-input min-w-[220px] flex-1"
          />

          <label class="flex items-center gap-2 text-label text-fg-muted">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected()}
              onChange={(event) =>
                props.onToggleAllVisible(selectableCandidateIds(), event.currentTarget.checked)
              }
              class="h-3.5 w-3.5 accent-signal"
            />
            <span>Select all visible</span>
          </label>

          <div class="font-mono text-meta text-fg-faint">
            {visibleSelectionSummary().visibleCount} visible ·{" "}
            {visibleSelectionSummary().selectedVisibleCount} selected
          </div>
        </div>

        <Show when={props.error}>
          <div class="mt-3 rounded-sharp border border-danger-soft px-3 py-2 text-label text-danger">
            {props.error}
          </div>
        </Show>
      </div>

      <div class="mt-3 min-h-0 flex-1 overflow-y-auto">
        <Show
          when={filteredCandidates().length > 0}
          fallback={
            <div class="flex min-h-full items-center justify-center rounded-panel border border-dashed border-line px-6 text-center text-label text-fg-subtle">
              {emptyMessage()}
            </div>
          }
        >
          <div class="flex min-h-0 flex-col">
            <div
              class={`sticky top-0 z-sticky grid ${rowColumns} items-center gap-3 border-b border-line bg-surface px-2 py-1 text-micro text-fg-subtle`}
            >
              <div />
              <div>Name</div>
              <div>Source</div>
              <div>Priority</div>
            </div>
            <For each={filteredCandidates()}>
              {(candidate) => (
                <label
                  class={`grid ${rowColumns} items-center gap-3 border-b border-line px-2 py-1.5 transition-colors duration-100 last:border-b-0 ${
                    candidate.alreadyExists ? "opacity-45" : "hover:bg-fill"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={props.selectedIds.includes(candidate.id)}
                    disabled={candidate.alreadyExists}
                    onChange={(event) =>
                      props.onToggleSelected(candidate.id, event.currentTarget.checked)
                    }
                    class="h-3.5 w-3.5 shrink-0 accent-signal"
                  />

                  <div class="min-w-0">
                    <div class="flex min-w-0 items-center gap-2">
                      <div class="truncate text-label font-medium text-fg">
                        {candidate.name}
                      </div>
                      <KindMeta kind={candidate.kind} />
                      <Show when={candidate.alreadyExists}>
                        <span class="shrink-0 text-micro text-fg-faint">already added</span>
                      </Show>
                    </div>
                    <div
                      class="truncate font-mono text-data text-fg-subtle"
                      title={candidate.target}
                    >
                      {candidate.target}
                    </div>
                  </div>

                  <SourceMeta>{formatSourceLabel(candidate.source)}</SourceMeta>

                  <ConfidenceMeta confidence={candidate.confidence} />
                </label>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

interface ChipProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function SourceChip(props: ChipProps) {
  return (
    <label
      class={`inline-flex cursor-pointer items-center rounded-sharp border px-2 py-1 text-label transition-colors duration-100 ${
        props.checked
          ? "border-signal-line bg-signal-soft text-signal"
          : "border-line text-fg-subtle hover:bg-fill hover:text-fg-muted"
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

function ToggleChip(props: ChipProps) {
  return (
    <label
      class={`inline-flex cursor-pointer items-center rounded-sharp border px-2 py-1 text-label transition-colors duration-100 ${
        props.checked
          ? "border-line-strong bg-fill-strong text-fg"
          : "border-line text-fg-subtle hover:bg-fill hover:text-fg-muted"
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
  return <span class="truncate text-meta text-fg-subtle">{props.children}</span>;
}

interface KindMetaProps {
  kind: DiscoveryCandidate["kind"];
}

function KindMeta(props: KindMetaProps) {
  return (
    <span class="shrink-0 font-mono text-micro text-fg-faint">{props.kind}</span>
  );
}

interface ConfidenceMetaProps {
  confidence: DiscoveryCandidate["confidence"];
}

function ConfidenceMeta(props: ConfidenceMetaProps) {
  // An intensity ladder, not a traffic light: high-confidence hits are the ones
  // worth importing, so they carry the accent rather than the alarm colors.
  const tone =
    props.confidence === "high"
      ? "text-signal"
      : props.confidence === "medium"
        ? "text-fg-muted"
        : "text-fg-faint";

  return <span class={`text-micro ${tone}`}>{props.confidence}</span>;
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
