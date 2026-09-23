import { describe, expect, it } from "vitest";
import { splitOnMatch } from "./highlight";

const plain = (text: string) => [{ text, match: false }];

describe("splitOnMatch", () => {
  it("marks the matched span and leaves the rest alone", () => {
    expect(splitOnMatch("httpx", "htt")).toEqual([
      { text: "htt", match: true },
      { text: "px", match: false },
    ]);
  });

  it("finds a match in the middle", () => {
    expect(splitOnMatch("Task Manager", "man")).toEqual([
      { text: "Task ", match: false },
      { text: "Man", match: true },
      { text: "ager", match: false },
    ]);
  });

  it("ignores case on both sides", () => {
    expect(splitOnMatch("Burp Suite", "BURP")).toEqual([
      { text: "Burp", match: true },
      { text: " Suite", match: false },
    ]);
  });

  it("marks every occurrence", () => {
    expect(splitOnMatch("abab", "ab")).toEqual([
      { text: "ab", match: true },
      { text: "ab", match: true },
    ]);
  });

  it("matches CJK the same way", () => {
    expect(splitOnMatch("信息收集工具", "收集")).toEqual([
      { text: "信息", match: false },
      { text: "收集", match: true },
      { text: "工具", match: false },
    ]);
  });

  it("returns the whole string unmarked when there is nothing to find", () => {
    expect(splitOnMatch("httpx", "zzz")).toEqual(plain("httpx"));
  });

  it("returns the whole string unmarked for an empty or blank query", () => {
    expect(splitOnMatch("httpx", "")).toEqual(plain("httpx"));
    expect(splitOnMatch("httpx", "   ")).toEqual(plain("httpx"));
  });

  it("handles empty text", () => {
    expect(splitOnMatch("", "htt")).toEqual(plain(""));
  });

  it("does not match past the end", () => {
    expect(splitOnMatch("ab", "abc")).toEqual(plain("ab"));
  });

  /// The whole string is a match when it matches, with no empty segments left
  /// over at either end.
  it("does not emit empty segments", () => {
    expect(splitOnMatch("httpx", "httpx")).toEqual([{ text: "httpx", match: true }]);
  });
});
