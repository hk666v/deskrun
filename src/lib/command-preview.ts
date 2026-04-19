import type { LaunchItem } from "../types";

export function buildCommandPreview(item: LaunchItem) {
  if (item.kind !== "command") {
    return item.target;
  }

  const segments = [item.command ?? item.target];

  if (item.fixedArgs?.trim()) {
    segments.push(item.fixedArgs.trim());
  }

  if (item.runtimeArgs?.trim()) {
    segments.push(item.runtimeArgs.trim());
  }

  const payload = segments.filter((value) => value.trim().length > 0).join(" ");
  const mode = item.keepOpen ? "/K" : "/C";
  return `cmd.exe ${mode} ${payload}`.trim();
}
