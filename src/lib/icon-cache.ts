import { readIcon } from "./commands";

/// Cached icons, keyed by the path the backend stored on the item. `null` means
/// "asked and there is nothing usable", so a missing icon is not re-requested on
/// every render.
const resolved = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/// Reads a card's icon as a `data:` URL, memoised per path.
///
/// `convertFileSrc` is not usable here: it produces `asset.localhost` URLs, and
/// the asset protocol is not enabled in this build, so every icon failed to load
/// and cards fell back to a text label.
export function loadIcon(iconPath: string): Promise<string | null> {
  const cached = resolved.get(iconPath);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const existing = inFlight.get(iconPath);
  if (existing) {
    return existing;
  }

  const request = readIcon(iconPath)
    .then((dataUrl) => {
      resolved.set(iconPath, dataUrl);
      return dataUrl;
    })
    .catch(() => {
      resolved.set(iconPath, null);
      return null;
    })
    .finally(() => {
      inFlight.delete(iconPath);
    });

  inFlight.set(iconPath, request);
  return request;
}
