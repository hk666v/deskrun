export interface TextSegment {
  text: string;
  match: boolean;
}

/// Splits text into the parts the query matched and the parts it did not.
///
/// Only literal matches are found, case-insensitively. A result that matched
/// through the pinyin index has no corresponding span in the displayed text, so
/// nothing is highlighted for it — which is honest, and better than highlighting
/// the wrong characters.
export function splitOnMatch(text: string, query: string): TextSegment[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0 || text.length === 0) {
    return [{ text, match: false }];
  }

  const segments: TextSegment[] = [];
  let plain = "";

  const flushPlain = () => {
    if (plain.length > 0) {
      segments.push({ text: plain, match: false });
      plain = "";
    }
  };

  let index = 0;
  while (index < text.length) {
    const candidate = text.slice(index, index + needle.length);

    // Compared at equal length: a case fold that changes length (there are a
    // few) then simply fails to match instead of shifting every later index.
    if (candidate.length === needle.length && candidate.toLowerCase() === needle) {
      flushPlain();
      segments.push({ text: candidate, match: true });
      index += needle.length;
    } else {
      plain += text[index];
      index += 1;
    }
  }

  flushPlain();
  return segments;
}
