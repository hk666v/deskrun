import type { Group } from "../types";

/// A group as the sidebar shows it: the group, and how far it is indented.
export interface GroupRow {
  group: Group;
  depth: number;
}

/// The groups filed directly inside `parentId`, in their own order. `null` is
/// the top level.
export function childrenOf(groups: Group[], parentId: string | null): Group[] {
  return groups
    .filter((group) => (group.parentId ?? null) === parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/// Every group inside `groupId` at any depth, itself excluded, in the order the
/// column draws them.
///
/// A visited set rather than a depth limit: the backend keeps the tree acyclic,
/// but this is called on every render and a cycle here would hang the window
/// rather than draw something wrong.
export function descendantIds(groups: Group[], groupId: string): string[] {
  const found: string[] = [];
  const seen = new Set([groupId]);
  // Each level goes on the stack in reverse, so the branch is walked in the
  // order the column draws it rather than backwards.
  const pending = childrenOf(groups, groupId).reverse();

  while (pending.length > 0) {
    const group = pending.pop() as Group;
    if (seen.has(group.id)) {
      continue;
    }
    seen.add(group.id);
    found.push(group.id);
    pending.push(...childrenOf(groups, group.id).reverse());
  }

  return found;
}

/// A group and everything filed under it — which is what selecting it shows, and
/// what its count counts.
export function subtreeIds(groups: Group[], groupId: string): string[] {
  return [groupId, ...descendantIds(groups, groupId)];
}

/// Where a group sits, from the top down: "代理 / 命令行工具".
///
/// A chip on an item has to say which group the item is in, and a nested group's
/// own name does not say where it is — two branches can each hold a "Tools".
export function groupPathLabel(groups: Group[], groupId: string): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current: string | null = groupId;

  while (current && !seen.has(current)) {
    seen.add(current);
    const group = groups.find((entry) => entry.id === current);
    if (!group) {
      break;
    }
    names.unshift(group.name);
    current = group.parentId ?? null;
  }

  return names.join(" / ");
}

/// Walks the tree the way the column draws it, leaving out the branches that are
/// collapsed.
export function flattenGroups(
  groups: Group[],
  isExpanded: (groupId: string) => boolean,
): GroupRow[] {
  const rows: GroupRow[] = [];
  const seen = new Set<string>();

  const walk = (parentId: string | null, depth: number) => {
    for (const group of childrenOf(groups, parentId)) {
      if (seen.has(group.id)) {
        continue;
      }
      seen.add(group.id);
      rows.push({ group, depth });
      if (isExpanded(group.id)) {
        walk(group.id, depth + 1);
      }
    }
  };

  walk(null, 0);
  return rows;
}
