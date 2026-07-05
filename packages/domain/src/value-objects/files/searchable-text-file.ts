/**
 * @file Text-decodability rule for project-wide search. Unlike AsciiDoc
 * scoping (which is extension-based), search covers *any* text-decodable file
 * regardless of extension (a `.csv`, a `.json`, an extensionless README), and
 * excludes binary/attachment files. The decision is made by sniffing a sample
 * of the file's bytes, never by extension, so it stays predictable without an
 * allow-list to maintain.
 */

/** Fraction of a sample allowed to be non-text control bytes before it is deemed binary. */
const MAX_CONTROL_RATIO = 0.3;

function isTextControlByte(byte: number): boolean {
  // Tab, LF, VT, FF, CR are ordinary in text; other C0 control bytes are not.
  return byte === 0x09 || byte === 0x0a || byte === 0x0b || byte === 0x0c || byte === 0x0d;
}

/**
 * Whether a file whose leading bytes are `sample` should be searched as text.
 *
 * A NUL byte (the classic binary marker) or an implausibly high proportion of
 * non-text control bytes marks the file as binary and excludes it. An empty
 * file is trivially text (it simply yields no matches).
 *
 * @param sample - The file's leading bytes (the caller reads a bounded prefix).
 */
export function isSearchableTextFile(sample: Uint8Array): boolean {
  if (sample.length === 0) return true;
  let controlBytes = 0;
  for (const byte of sample) {
    if (byte === 0x00) return false;
    if (byte < 0x20 && !isTextControlByte(byte)) controlBytes += 1;
  }
  return controlBytes / sample.length <= MAX_CONTROL_RATIO;
}
