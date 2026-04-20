import { pinyin } from "pinyin-pro";
import type { LaunchItem } from "../types";

export interface SearchIndexEntry {
  id: string;
  normalizedName: string;
  normalizedNote: string;
  normalizedCombined: string;
  pinyinFullName: string;
  pinyinInitialsName: string;
  pinyinFullCombined: string;
  pinyinInitialsCombined: string;
}

export function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s`~!@#$%^&*()+=\[\]{}|\\:;"'<>,.?/\-]+/g, "");
}

export function buildSearchIndexEntry(item: LaunchItem): SearchIndexEntry {
  const note = item.note ?? "";
  const joined = [item.name, note].filter(Boolean).join(" ");

  return {
    id: item.id,
    normalizedName: normalizeSearchValue(item.name),
    normalizedNote: normalizeSearchValue(note),
    normalizedCombined: normalizeSearchValue(joined),
    pinyinFullName: toFullPinyin(item.name),
    pinyinInitialsName: toInitialPinyin(item.name),
    pinyinFullCombined: toFullPinyin(joined),
    pinyinInitialsCombined: toInitialPinyin(joined),
  };
}

export function matchesSearch(entry: SearchIndexEntry, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  return calculateSearchScore(entry, null, normalizedQuery) > 0;
}

export function calculateSearchScore(
  entry: SearchIndexEntry,
  item: LaunchItem | null,
  query: string,
) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;

  score = Math.max(score, matchTier(entry.normalizedName, normalizedQuery, 1600, 1500, 1320));
  score = Math.max(score, matchTier(entry.pinyinFullName, normalizedQuery, 1220, 1160, 1080));
  score = Math.max(score, matchTier(entry.normalizedNote, normalizedQuery, 980, 920, 860));
  score = Math.max(score, matchTier(entry.pinyinFullCombined, normalizedQuery, 780, 740, 700));
  score = Math.max(score, matchTier(entry.pinyinInitialsName, normalizedQuery, 640, 600, 560));
  score = Math.max(score, matchTier(entry.pinyinInitialsCombined, normalizedQuery, 500, 470, 430));
  score = Math.max(score, matchTier(entry.normalizedCombined, normalizedQuery, 380, 340, 300));

  if (score === 0 || !item) {
    return score;
  }

  return score + preferenceBonus(item);
}

function toFullPinyin(value: string) {
  return normalizeSearchValue(
    pinyin(value, {
      toneType: "none",
      type: "string",
      separator: "",
      nonZh: "consecutive",
      v: true,
    }),
  );
}

function toInitialPinyin(value: string) {
  return normalizeSearchValue(
    pinyin(value, {
      toneType: "none",
      pattern: "first",
      type: "string",
      separator: "",
      nonZh: "consecutive",
      v: true,
    }),
  );
}

function matchTier(
  haystack: string,
  needle: string,
  exactScore: number,
  prefixScore: number,
  containsScore: number,
) {
  if (!haystack) {
    return 0;
  }
  if (haystack === needle) {
    return exactScore;
  }
  if (haystack.startsWith(needle)) {
    return prefixScore;
  }
  if (haystack.includes(needle)) {
    return containsScore;
  }
  return 0;
}

function preferenceBonus(item: LaunchItem) {
  let bonus = 0;

  if (item.isFavorite) {
    bonus += 14;
  }

  if (item.lastLaunchedAt) {
    bonus += 6;
    const launchedAt = new Date(item.lastLaunchedAt);
    if (!Number.isNaN(launchedAt.getTime())) {
      const ageInDays = (Date.now() - launchedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays <= 7) {
        bonus += 12;
      } else if (ageInDays <= 30) {
        bonus += 8;
      } else {
        bonus += 4;
      }
    }
  }

  bonus += Math.min(item.launchCount, 12);
  return bonus;
}
