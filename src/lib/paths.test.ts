import { describe, expect, it } from "vitest";
import { compactPath } from "./paths";

describe("compactPath", () => {
  it("leaves a short path alone", () => {
    expect(compactPath("C:\\Tools\\app.exe")).toBe("C:\\Tools\\app.exe");
  });

  /// The point of the whole thing: the visible part has to be the part that
  /// differs between entries, which for Start Menu shortcuts is the tail.
  it("keeps the tail and drops the shared prefix", () => {
    expect(
      compactPath(
        "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\7-Zip File Manager.lnk",
      ),
    ).toBe("C:\\...\\Programs\\7-Zip File Manager.lnk");
  });

  it("normalises forward slashes before deciding", () => {
    expect(
      compactPath(
        "C:/Users/Administrator/AppData/Local/Programs/Microsoft VS Code/Code.exe",
      ),
    ).toBe("C:\\...\\Microsoft VS Code\\Code.exe");
  });

  it("handles a path with no drive letter", () => {
    const collapsed = compactPath(
      "\\\\fileserver\\engineering\\releases\\2026\\q3\\tools\\network\\scanner\\bin\\scanner.exe",
    );
    expect(collapsed).toBe("...\\bin\\scanner.exe");
  });

  /// A short path is left alone even when it has plenty of segments: the point
  /// is to save width, and there is no width to save.
  it("needs the path to actually be long, not just deep", () => {
    expect(compactPath("C:\\a\\b\\c\\d\\e\\f\\g\\h\\i\\j\\k\\l\\m\\n\\o\\p.exe")).toBe(
      "C:\\a\\b\\c\\d\\e\\f\\g\\h\\i\\j\\k\\l\\m\\n\\o\\p.exe",
    );
  });

  it("needs more than the tail to be worth collapsing", () => {
    expect(compactPath("C:\\a\\b\\c.exe")).toBe("C:\\a\\b\\c.exe");
  });
});
