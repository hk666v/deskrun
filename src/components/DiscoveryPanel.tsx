import { For, Show, createEffect, createMemo } from "solid-js";
import type { DiscoveryCandidate, DiscoveryScanOptions } from "../types";
import { compactPath } from "../lib/paths";

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

/// What the value means. It describes how the target was found, not how
/// desirable the app is — the column used to read "Priority", which invited
/// exactly the wrong reading.
const MATCH_LABEL: Record<
  DiscoveryCandidate["confidence"],
  { text: string; hint: string }
> = {
  high: {
    text: "shortcut",
    hint: "A shortcut Windows itself presents as a program.",
  },
  medium: {
    text: "declared",
    hint: "Taken from the app's own install information.",
  },
  low: {
    text: "guessed",
    hint: "No direct evidence — picked out of the install folder. Worth checking the path before importing.",
  },
};

export function DiscoveryPanel(props: DiscoveryPanelProps) {
  let selectAllRef!: HTMLInputElement;
  // Source is gone as a column: it was two near-empty cells taking the width the
  // path needed, and `match` already says how much to trust a row.
  const rowColumns = "grid-cols-[16px_minmax(0,1fr)_72px]";

  const filteredCandidates = createMemo(() => {
    const term = props.searchQuery.trim().toLowerCase();
    return props.candidates.filter((candidate) => {
      if (props.hideExisting && candidate.alreadyExists) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [candidate.name, candidate.target]
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

  const selectedVisibleCount = createMemo(() => {
    const selectableIds = selectableCandidateIds();
    return selectableIds.filter((candidateId) =>
      props.selectedIds.includes(candidateId),
    ).length;
  });

  createEffect(() => {
    if (selectAllRef) {
      selectAllRef.indeterminate = !allVisibleSelected() && someVisibleSelected();
    }
  });

  const emptyMessage = () => {
    if (props.candidates.length === 0) {
      return "Run a scan to look through Start Menu shortcuts, desktop shortcuts, and installed app registry entries, then import the ones you want.";
    }

    const term = props.searchQuery.trim();
    if (term.length > 0) {
      return `No discovered apps match “${term}”.`;
    }

    return "Every discovered app is already in your library. Turn off “Hide existing” to see them.";
  };

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface p-3">
      <div class="flex shrink-0 items-center justify-between gap-3 px-1">
        <h2 class="text-title font-semibold text-fg">Find installed apps</h2>

        <div class="flex shrink-0 items-center gap-2">
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

      <div class="mt-3 flex shrink-0 flex-wrap items-center gap-2">
        {/* Plain toggles, not the accent: amber is reserved for selection and the
            one primary action, and three lit-up chips drowned out the button. */}
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

        {/* Groups the row into three: what to scan, how to filter, and what is
            selected. Without the dividers those read as one long control strip. */}
        <div class="mx-1 h-4 w-px shrink-0 bg-line" />

        <input
          value={props.searchQuery}
          onInput={(event) => props.onSearchQueryChange(event.currentTarget.value)}
          aria-label="Filter discovered apps"
          placeholder="Filter discovered apps"
          class="field-input min-w-[160px] flex-1"
        />

        <ToggleChip
          label="Hide existing"
          checked={props.hideExisting}
          onChange={props.onSetHideExisting}
        />

        <div class="mx-1 h-4 w-px shrink-0 bg-line" />

        <label class="flex shrink-0 cursor-pointer items-center gap-2 text-label text-fg-muted">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleSelected()}
            onChange={(event) =>
              props.onToggleAllVisible(selectableCandidateIds(), event.currentTarget.checked)
            }
            class="h-3.5 w-3.5 accent-signal"
          />
          <span>Select all</span>
        </label>

        <div
          class="shrink-0 font-mono text-meta text-fg-faint"
          title={`${selectedVisibleCount()} of ${filteredCandidates().length} visible selected`}
        >
          {selectedVisibleCount()}/{filteredCandidates().length}
        </div>
      </div>

      <Show when={props.error}>
        <div
          role="alert"
          class="mt-3 shrink-0 rounded-sharp border border-danger-soft px-3 py-2 text-label text-danger"
        >
          {props.error}
        </div>
      </Show>

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
              <div>Match</div>
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
                      <span class="shrink-0 font-mono text-micro text-fg-faint">
                        {candidate.kind}
                      </span>
                      <Show when={candidate.alreadyExists}>
                        <span class="shrink-0 text-micro text-fg-faint">
                          already added
                        </span>
                      </Show>
                    </div>
                    <div
                      class="truncate font-mono text-data text-fg-subtle"
                      title={candidate.target}
                    >
                      {compactPath(candidate.target)}
                    </div>
                  </div>

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
      class={`inline-flex shrink-0 cursor-pointer items-center rounded-sharp border px-2 py-1 text-label transition-colors duration-100 ${
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

function ToggleChip(props: ChipProps) {
  return (
    <label
      class={`inline-flex shrink-0 cursor-pointer items-center rounded-sharp border px-2 py-1 text-label transition-colors duration-100 ${
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

interface ConfidenceMetaProps {
  confidence: DiscoveryCandidate["confidence"];
}

function ConfidenceMeta(props: ConfidenceMetaProps) {
  const label = MATCH_LABEL[props.confidence];
  const tone =
    props.confidence === "high"
      ? "text-signal"
      : props.confidence === "medium"
        ? "text-fg-muted"
        : "text-fg-faint";

  return (
    <span class={`truncate text-micro ${tone}`} title={label.hint}>
      {label.text}
    </span>
  );
}
