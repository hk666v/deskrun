import { describe, expect, it } from "vitest";
import { buildQueryActions, readNumber, resolveUrl, searchUrl } from "./query-actions";

describe("readNumber", () => {
  it("reads a hex literal and offers the decimal counterpart", () => {
    const reading = readNumber("0x1f");
    expect(reading?.decimal).toBe("31");
    expect(reading?.counterpart).toBe("31");
  });

  it("reads an h-suffixed hex literal", () => {
    expect(readNumber("1fh")?.decimal).toBe("31");
    expect(readNumber("FFh")?.decimal).toBe("255");
  });

  it("reads the binary and octal prefixes", () => {
    expect(readNumber("0b1010")?.decimal).toBe("10");
    expect(readNumber("0o17")?.decimal).toBe("15");
  });

  it("treats bare digits as decimal and offers hex back", () => {
    const reading = readNumber("255");
    expect(reading?.base).toBe(10);
    expect(reading?.counterpart).toBe("0xff");
  });

  it("keeps every representation consistent", () => {
    const reading = readNumber("255");
    expect(reading?.hex).toBe("0xff");
    expect(reading?.binary).toBe("0b11111111");
    expect(reading?.octal).toBe("0o377");
  });

  /// Routing this through a JS number would silently round it.
  it("stays exact past what a double can hold", () => {
    expect(readNumber("0xffffffffffffffff")?.decimal).toBe("18446744073709551615");
  });

  /// `1b` is the ambiguous case — binary with a suffix, or hex without a prefix?
  /// Only the prefixed forms are accepted, so it is deliberately not a number.
  it("refuses the ambiguous suffix forms", () => {
    expect(readNumber("1b")).toBeNull();
    expect(readNumber("17o")).toBeNull();
  });

  it("refuses anything that is not a number", () => {
    expect(readNumber("nuclei")).toBeNull();
    expect(readNumber("")).toBeNull();
    expect(readNumber("0x")).toBeNull();
    expect(readNumber("12 34")).toBeNull();
  });

  it("refuses input too long to be a useful readout", () => {
    expect(readNumber("1".repeat(25))).toBeNull();
  });
});

describe("resolveUrl", () => {
  it("keeps an explicit scheme", () => {
    expect(resolveUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(resolveUrl("mailto:me@example.com")).toBe("mailto:me@example.com");
  });

  it("assumes https for a bare domain", () => {
    expect(resolveUrl("docs.projectdiscovery.io")).toBe("https://docs.projectdiscovery.io");
    expect(resolveUrl("example.com:8443")).toBe("https://example.com:8443");
  });

  /// Every browser treats a bare `localhost:8080` as a search term, so the
  /// scheme has to be spelled out.
  it("assumes http for localhost", () => {
    expect(resolveUrl("localhost")).toBe("http://localhost");
    expect(resolveUrl("localhost:1420")).toBe("http://localhost:1420");
  });

  /// Searching for a file must not offer to open a website.
  it("does not mistake a filename for a domain", () => {
    expect(resolveUrl("nuclei.json")).toBeNull();
    expect(resolveUrl("app.exe")).toBeNull();
    expect(resolveUrl("notes.md")).toBeNull();
  });

  it("does not treat a phrase or a bare word as a domain", () => {
    expect(resolveUrl("how to scan")).toBeNull();
    expect(resolveUrl("httpx")).toBeNull();
  });
});

describe("searchUrl", () => {
  it("percent-encodes the term so `&` does not split the query", () => {
    expect(searchUrl("a&b=c")).toContain("q=a%26b%3Dc");
  });
});

describe("buildQueryActions", () => {
  it("offers nothing for an empty query", () => {
    expect(buildQueryActions("   ")).toEqual([]);
  });

  it("always offers a web search last", () => {
    const actions = buildQueryActions("nuclei poc");
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("web");
  });

  /// The first row is what Enter runs, so the most specific offer has to be on
  /// top.
  it("puts the URL above the web search", () => {
    expect(buildQueryActions("example.com").map((action) => action.kind)).toEqual([
      "url",
      "web",
    ]);
  });

  it("offers a conversion alongside the web search", () => {
    const actions = buildQueryActions("0x1f");
    expect(actions.map((action) => action.kind)).toEqual(["number", "web"]);
    expect(actions[0].label).toBe("Copy 31");
  });
});
