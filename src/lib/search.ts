import { pinyin } from "pinyin-pro";
import type { LaunchItem } from "../types";

export interface SearchIndexEntry {
  id: string;
  normalized: string;
  pinyinFull: string;
  pinyinInitials: string;
}

export function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s`~!@#$%^&*()+=\[\]{}|\\:;"'<>,.?/\-]+/g, "");
}

export function buildSearchIndexEntry(item: LaunchItem): SearchIndexEntry {
  const parts = [item.name, item.note ?? ""].filter(Boolean);
  const joined = parts.join(" ");

  return {
    id: item.id,
    normalized: normalizeSearchValue(joined),
    pinyinFull: normalizeSearchValue(
      pinyin(joined, {
        toneType: "none",
        type: "string",
        separator: "",
        nonZh: "consecutive",
        v: true,
      }),
    ),
    pinyinInitials: normalizeSearchValue(
      pinyin(joined, {
        toneType: "none",
        pattern: "first",
        type: "string",
        separator: "",
        nonZh: "consecutive",
        v: true,
      }),
    ),
  };
}

export function matchesSearch(entry: SearchIndexEntry, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  return (
    entry.normalized.includes(normalizedQuery) ||
    entry.pinyinFull.includes(normalizedQuery) ||
    entry.pinyinInitials.includes(normalizedQuery)
  );
}
