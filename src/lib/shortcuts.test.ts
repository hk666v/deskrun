import { describe, expect, it } from "vitest";
import {
  describeShortcut,
  isUsableShortcut,
  matchesShortcut,
  parseShortcut,
} from "./shortcuts";

const event = (key: string, modifiers: Partial<KeyboardEvent> = {}) =>
  ({ key, ctrlKey: false, altKey: false, shiftKey: false, ...modifiers }) as KeyboardEvent;

/// A press with the physical key as well as the character, which is what the
/// app's own listener sees and what recording reads.
const press = (key: string, code: string, modifiers: Partial<KeyboardEvent> = {}) =>
  ({ ...event(key, modifiers), code }) as KeyboardEvent;

describe("parseShortcut", () => {
  it("reads the modifiers and the key", () => {
    expect(parseShortcut("Ctrl+O")).toEqual({ ctrl: true, alt: false, shift: false, key: "o" });
    expect(parseShortcut("Alt+Space")).toEqual({ ctrl: false, alt: true, shift: false, key: "space" });
  });

  it("takes more than one modifier, in any order", () => {
    expect(parseShortcut("Shift+Ctrl+K")).toEqual({
      ctrl: true,
      alt: false,
      shift: true,
      key: "k",
    });
  });

  it("is nothing at all without a modifier", () => {
    expect(parseShortcut("s")).toBeNull();
    expect(parseShortcut("")).toBeNull();
  });

  it("is nothing when the key is missing or is itself a modifier", () => {
    expect(parseShortcut("Ctrl")).toBeNull();
    expect(parseShortcut("Ctrl+Shift")).toBeNull();
  });

  it("is nothing when an unknown part is in the middle", () => {
    expect(parseShortcut("Ctrl+Banana+S")).toBeNull();
  });
});

describe("matchesShortcut", () => {
  it("matches exactly the modifiers that were asked for", () => {
    expect(matchesShortcut(event("s", { ctrlKey: true }), "Ctrl+S")).toBe(true);
    expect(matchesShortcut(event("S", { ctrlKey: true }), "ctrl+s")).toBe(true);
    expect(matchesShortcut(event("s", { ctrlKey: true, shiftKey: true }), "Ctrl+S")).toBe(false);
    expect(matchesShortcut(event("s"), "Ctrl+S")).toBe(false);
  });

  it("never matches a shortcut it cannot read", () => {
    expect(matchesShortcut(event("s", { ctrlKey: true }), "s")).toBe(false);
  });
});

describe("isUsableShortcut", () => {
  it("wants Ctrl or Alt, or it would eat typing", () => {
    expect(isUsableShortcut("Ctrl+S")).toBe(true);
    expect(isUsableShortcut("Alt+O")).toBe(true);
    expect(isUsableShortcut("Shift+S")).toBe(false);
    expect(isUsableShortcut("o")).toBe(false);
  });
});

describe("describeShortcut", () => {
  it("writes the combination the way the settings file stores it", () => {
    expect(describeShortcut(event("s", { ctrlKey: true }))).toBe("Ctrl+S");
    expect(describeShortcut(event(" ", { altKey: true }))).toBe("Alt+Space");
    expect(describeShortcut(event("k", { ctrlKey: true, altKey: true, shiftKey: true }))).toBe(
      "Ctrl+Alt+Shift+K",
    );
  });

  it("names the key rather than whatever shift made of it", () => {
    expect(describeShortcut(event("#", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+#");
    expect(describeShortcut(event("ArrowUp"))).toBe("ArrowUp");
  });

  // What a field records is what the app has to recognise later, so the two
  // halves of the shortcut code are checked against each other.
  it("records something the listener will match again", () => {
    const presses = [
      press("s", "KeyS", { ctrlKey: true }),
      press(" ", "Space", { altKey: true }),
      press("ArrowUp", "ArrowUp", { ctrlKey: true }),
      press("k", "KeyK", { ctrlKey: true, shiftKey: true }),
    ];

    for (const pressed of presses) {
      const value = describeShortcut(pressed);
      expect(isUsableShortcut(value)).toBe(true);
      expect(matchesShortcut(pressed, value)).toBe(true);
    }
  });
});
