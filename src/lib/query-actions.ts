import { openUrl } from "@tauri-apps/plugin-opener";
import { copyText } from "./clipboard";

/// What the launcher offers when the query matches no item. Typing something and
/// pressing Enter should never be a dead end.
export interface QueryAction {
  id: string;
  kind: "url" | "number" | "web";
  label: string;
  detail: string;
  /// Shown once the action has run.
  done: string;
  run: () => Promise<void>;
}

/// Anything longer is not something anyone reads off a launcher row, and the
/// binary expansion stops being useful well before that.
const MAX_NUMERIC_INPUT = 24;

type NumericBase = 10 | 16 | 8 | 2;

export interface NumberForms {
  base: NumericBase;
  decimal: string;
  hex: string;
  binary: string;
  octal: string;
  /// What Enter copies: the representation the user did not type.
  counterpart: string;
}

/// Understands `0x1f`, `1fh`, `0b1010` and `0o17`.
///
/// Bare digits are always decimal. Guessing a base would make an ordinary query
/// silently mean a different number, and `1b` in particular is ambiguous
/// between binary-with-a-suffix and hex-without-a-prefix, so suffix forms are
/// only accepted for hex where nothing collides.
export function readNumber(term: string): NumberForms | null {
  const text = term.trim();
  if (text.length === 0 || text.length > MAX_NUMERIC_INPUT) {
    return null;
  }

  const parsed = parseNumericLiteral(text);
  if (!parsed) {
    return null;
  }

  const { value, base } = parsed;
  const forms = {
    decimal: value.toString(10),
    hex: `0x${value.toString(16)}`,
    binary: `0b${value.toString(2)}`,
    octal: `0o${value.toString(8)}`,
  };

  return {
    base,
    ...forms,
    counterpart: base === 10 ? forms.hex : forms.decimal,
  };
}

function parseNumericLiteral(text: string): { value: bigint; base: NumericBase } | null {
  const rules: Array<{ pattern: RegExp; base: NumericBase; prefix: string }> = [
    { pattern: /^0x([0-9a-f]+)$/i, base: 16, prefix: "0x" },
    { pattern: /^([0-9a-f]+)h$/i, base: 16, prefix: "0x" },
    { pattern: /^0b([01]+)$/i, base: 2, prefix: "0b" },
    { pattern: /^0o([0-7]+)$/i, base: 8, prefix: "0o" },
    { pattern: /^[0-9]+$/, base: 10, prefix: "" },
  ];

  for (const rule of rules) {
    const match = rule.pattern.exec(text);
    if (!match) {
      continue;
    }

    const digits = match[1] ?? match[0];
    try {
      return { value: BigInt(`${rule.prefix}${digits}`), base: rule.base };
    } catch {
      // Longer than BigInt will take; not worth surfacing.
      return null;
    }
  }

  return null;
}

/// Extensions that look like a top-level domain but are not one. Without this,
/// searching for `config.json` offers to open a website.
const NOT_A_TLD = new Set([
  "bat", "cfg", "dll", "exe", "gif", "go", "ini", "jpeg", "jpg", "js", "json",
  "lnk", "log", "md", "pdf", "png", "ps1", "py", "rs", "sh", "sql", "sys",
  "toml", "ts", "txt", "yaml", "yml", "zip",
]);

const DOMAIN_PATTERN = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,24})(?::\d{1,5})?(?:\/\S*)?$/i;
const LOCALHOST_PATTERN = /^localhost(?::\d{1,5})?(?:\/\S*)?$/i;
const SCHEME_PATTERN = /^(?:https?|mailto|tel):\S+$/i;

/// Something worth handing to the browser: an explicit scheme, `localhost:port`,
/// or a bare domain.
export function resolveUrl(term: string): string | null {
  const text = term.trim();
  if (text.includes(" ")) {
    return null;
  }

  if (SCHEME_PATTERN.test(text)) {
    return text;
  }

  if (LOCALHOST_PATTERN.test(text)) {
    // Browsers treat a bare `localhost:8080` as a search, so be explicit.
    return `http://${text}`;
  }

  const domain = DOMAIN_PATTERN.exec(text);
  if (domain && !NOT_A_TLD.has(domain[2].toLowerCase())) {
    return `https://${text}`;
  }

  return null;
}

export function searchUrl(term: string) {
  return `https://www.bing.com/search?q=${encodeURIComponent(term.trim())}`;
}

export function buildQueryActions(term: string): QueryAction[] {
  const text = term.trim();
  if (text.length === 0) {
    return [];
  }

  const actions: QueryAction[] = [];

  const url = resolveUrl(text);
  if (url) {
    actions.push({
      id: "open-url",
      kind: "url",
      label: `Open ${url}`,
      detail: "In your default browser",
      done: `Opened ${url}`,
      run: () => openUrl(url),
    });
  }

  const number = readNumber(text);
  if (number) {
    actions.push({
      id: "convert-number",
      kind: "number",
      label: `Copy ${number.counterpart}`,
      detail: `dec ${number.decimal} · hex ${number.hex} · bin ${number.binary} · oct ${number.octal}`,
      done: `Copied ${number.counterpart}`,
      run: () => copyText(number.counterpart),
    });
  }

  actions.push({
    id: "web-search",
    kind: "web",
    label: `Search the web for “${text}”`,
    detail: "In your default browser",
    done: `Searched the web for “${text}”`,
    run: () => openUrl(searchUrl(text)),
  });

  return actions;
}
