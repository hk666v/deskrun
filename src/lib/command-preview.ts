import type { LaunchItem } from "../types";

export function buildCommandPreview(
  item: LaunchItem,
  runtimeTarget = "{target}",
) {
  if (item.kind !== "command") {
    return item.target;
  }

  const segments = [item.command ?? item.target];

  if (item.fixedArgs?.trim()) {
    segments.push(item.fixedArgs.trim());
  }

  if (item.runtimeArgsTemplate?.trim()) {
    const template = item.runtimeArgsTemplate.trim();
    segments.push(
      template.includes("{target}")
        ? template.replaceAll("{target}", runtimeTarget)
        : template,
    );
  }

  const payload = segments.filter((value) => value.trim().length > 0).join(" ");
  const mode = item.keepOpen ? "/K" : "/C";
  return `cmd.exe ${mode} ${payload}`.trim();
}

export function requiresRuntimeTarget(item: LaunchItem) {
  return (
    item.kind === "command" &&
    (item.runtimeArgsTemplate?.includes("{target}") ?? false)
  );
}
