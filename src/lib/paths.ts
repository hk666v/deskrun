/// Collapses a long Windows path to `D:\...\tail\file`.
///
/// Truncating from the right hides exactly the part that distinguishes one entry
/// from its neighbours: every shortcut under the Start Menu shares the same long
/// prefix, so the visible characters carry no information while the file name —
/// the part that does — is the first thing to be cut off.
export function compactPath(value: string, maxLength = 58, keepSegments = 2): string {
  const normalized = value.replace(/\//g, "\\");
  const segments = normalized.split("\\").filter(Boolean);

  if (segments.length <= 3 || normalized.length <= maxLength) {
    return value;
  }

  const drive = normalized.match(/^[A-Za-z]:/)?.[0];
  const tail = segments.slice(-keepSegments).join("\\");

  return drive ? `${drive}\\...\\${tail}` : `...\\${tail}`;
}
