/// A keyboard shortcut written the way the settings file stores it — "Ctrl+S",
/// "Alt+Space". Modifiers come first in any order; the last part is the key.
export interface Shortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const MODIFIERS = new Set([
  "ctrl",
  "control",
  "alt",
  "shift",
  "meta",
  "cmd",
  "super",
  "win",
]);

/// Reads a shortcut, or null when it is not one. A bare key is not a shortcut:
/// binding "s" would eat every "s" typed into the search field.
export function parseShortcut(value: string): Shortcut | null {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return null;
  }

  const key = parts[parts.length - 1].toLowerCase();
  const modifiers = parts.slice(0, -1).map((part) => part.toLowerCase());
  if (MODIFIERS.has(key) || modifiers.some((modifier) => !MODIFIERS.has(modifier))) {
    return null;
  }

  return {
    ctrl: modifiers.includes("ctrl") || modifiers.includes("control"),
    alt: modifiers.includes("alt"),
    shift: modifiers.includes("shift"),
    key,
  };
}

/// Whether a keyboard event is this shortcut. Every modifier has to agree, so
/// Ctrl+S does not fire on Ctrl+Shift+S.
///
/// The key is matched against both `key` and `code`, because they disagree on
/// exactly the keys a shortcut is likely to use: the space bar is " " as a key
/// and "Space" as a code, and a recorded shortcut is written the second way.
export function matchesShortcut(event: KeyboardEvent, value: string): boolean {
  const shortcut = parseShortcut(value);
  if (!shortcut) {
    return false;
  }

  return (
    event.ctrlKey === shortcut.ctrl &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    (event.key.toLowerCase() === shortcut.key || event.code.toLowerCase() === shortcut.key)
  );
}

/// The name a pressed key is written under: "S", "Space", "ArrowUp". The letter
/// case is the app's, not the keyboard's — a shortcut recorded while shift was
/// held would otherwise be stored as "Shift+#".
export function keyName(event: KeyboardEvent): string {
  if (event.key === " ") {
    return "Space";
  }

  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
}

/// The whole combination a key press stands for, in the order the settings file
/// writes them: "Ctrl+Shift+K".
export function describeShortcut(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }

  parts.push(keyName(event));
  return parts.join("+");
}

/// Whether a shortcut is safe to bind inside the launcher. It has to carry Ctrl
/// or Alt: Shift alone is still typing, and the launcher is typed into.
export function isUsableShortcut(value: string): boolean {
  const shortcut = parseShortcut(value);
  return Boolean(shortcut && (shortcut.ctrl || shortcut.alt));
}
