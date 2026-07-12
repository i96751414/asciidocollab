/**
 * @file Deterministic-output normalization for raw PDF bytes.
 *
 * Asciidoctor-PDF / Prawn stamp ambient, run-varying state into every rendered
 * document: the Info dictionary carries `/CreationDate` and `/ModDate` derived
 * from the wall clock, and the trailer carries a random document `/ID` array.
 * Two renders of the *same* source therefore differ byte-for-byte, which breaks
 * both the content-addressed render cache and the visual reference-parity
 * harness (which normalizes metadata before diffing).
 *
 * This module produces a byte-stable normalization by neutralizing exactly
 * those ambient fields: the two dates are rewritten to a value derived from a
 * fixed epoch (default: the Unix epoch), and both `/ID` entries are rewritten to
 * a single fixed hex string. Everything else in the byte stream is preserved
 * verbatim.
 *
 * ## Approach
 *
 * It is a pure, self-contained byte-scan — deliberately **not** a full PDF
 * parser. The three ambient tokens (`/CreationDate (…)`, `/ModDate (…)` and the
 * trailer `/ID […]`) are ASCII, so the bytes are mapped 1:1 to a latin1 string,
 * three anchored patterns rewrite the token *contents*, and the string is mapped
 * back to bytes. The mapping is lossless for all 256 byte values, so binary
 * object/stream data outside the matched tokens is untouched. It never consults
 * the wall clock, locale, network, or filesystem: given identical input bytes
 * (and epoch) it always yields identical output bytes.
 *
 * ## Documented limits
 *
 * - **No cross-reference repair.** Rewritten tokens can change the byte length
 *   of the file, which invalidates the `xref` table / stream offsets and the
 *   startxref pointer. That is acceptable here: the normalized bytes exist for
 *   cache-keying and parity-diffing (both operate on the raw/rasterized bytes),
 *   not to be re-opened as a strictly-conforming PDF. A length-preserving rewrite
 *   would be required before feeding output back into a strict PDF consumer.
 * - **Info-dictionary + trailer only.** Timestamps duplicated inside an XMP
 *   metadata stream (`xmp:CreateDate`, `xmp:ModifyDate`) or a producer string are
 *   not touched; Prawn does not emit an XMP packet by default, but a theme that
 *   enables one would leave that residual nondeterminism in place.
 * - **Literal-string date form only.** Dates written as PDF hex strings
 *   (`/CreationDate <…>`) rather than literal `(D:…)` strings are not matched.
 * - **Trailer form only.** Encrypted or object-stream-compressed trailers that do
 *   not expose `/ID […]` in the clear byte stream are out of scope.
 */

/**
 * Fixed point in time (seconds since the Unix epoch) used to derive the
 * neutralized `/CreationDate` and `/ModDate` when no override is supplied. The
 * Unix epoch is chosen as an unambiguous, locale-independent sentinel.
 */
export const DEFAULT_SOURCE_DATE_EPOCH_SECONDS = 0;

/**
 * Fixed 16-byte (32 hex character) value written into both slots of the trailer
 * `/ID` array, replacing the producer's random file identifier.
 */
export const FIXED_DOCUMENT_ID_HEX = '0'.repeat(32);

/** Largest chunk passed to `String.fromCodePoint` to avoid call-stack overflow on large PDFs. */
const BYTE_STRING_CHUNK_SIZE = 0x80_00;

/**
 * Matches a PDF Info-dictionary date entry and captures its parenthesized
 * literal contents. The content class `[^)/]*` stops at the closing `)` (a
 * literal date string never contains an unescaped `)`) and also at any `/`,
 * which can only begin the next PDF name token — excluding it keeps the scan
 * linear (the greedy run can never span from one date entry into a later one)
 * while never affecting a real date literal, whose characters exclude `/`.
 */
const CREATION_DATE_PATTERN = /(\/CreationDate\s*\()([^)/]*)(\))/g;
const MOD_DATE_PATTERN = /(\/ModDate\s*\()([^)/]*)(\))/g;

/**
 * Matches the trailer document-identifier array and captures its contents. The
 * trailing delimiter (`\s*\[`) prevents matching names that merely start with
 * `ID` (e.g. `/IDTree [`). The content class `[^\]/]*` stops at the closing
 * bracket and at any `/` that would begin the next name token; excluding `/`
 * bounds the greedy run to a single array (keeping the scan linear) and never
 * affects a real `<hex><hex>` identifier, which contains no `/`.
 */
const DOCUMENT_ID_PATTERN = /(\/ID\s*\[)([^\]/]*)(\])/g;

/** Zero-pad a number to a fixed width using only integer/string math (locale-independent). */
const padNumber = (value: number, width: number): string => String(value).padStart(width, '0');

/**
 * Render a PDF literal date string (`D:YYYYMMDDHHmmSS+00'00'`) from an epoch,
 * always in UTC so the result never depends on the host time zone.
 */
const formatPdfDate = (epochSeconds: number): string => {
  const instant = new Date(epochSeconds * 1000);
  const year = padNumber(instant.getUTCFullYear(), 4);
  const month = padNumber(instant.getUTCMonth() + 1, 2);
  const day = padNumber(instant.getUTCDate(), 2);
  const hours = padNumber(instant.getUTCHours(), 2);
  const minutes = padNumber(instant.getUTCMinutes(), 2);
  const seconds = padNumber(instant.getUTCSeconds(), 2);
  return `D:${year}${month}${day}${hours}${minutes}${seconds}+00'00'`;
};

/** Map raw bytes to a latin1 string where each character code equals one byte value. */
const bytesToBinaryString = (bytes: Uint8Array): string => {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += BYTE_STRING_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BYTE_STRING_CHUNK_SIZE);
    result += String.fromCodePoint(...chunk);
  }
  return result;
};

/** Inverse of {@link bytesToBinaryString}: map a latin1 string back to raw bytes. */
const binaryStringToBytes = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = (text.codePointAt(index) ?? 0) & 0xFF;
  }
  return bytes;
};

/**
 * Return a byte-stable normalization of `pdfBytes` with all ambient timestamp
 * and document-identifier nondeterminism replaced by fixed values.
 *
 * The transform is pure (no wall clock, locale, network, or I/O) and idempotent:
 * the replacement values themselves match the patterns, so re-normalizing an
 * already-normalized document reproduces the same bytes.
 *
 * @param pdfBytes - Raw bytes the render VM wrote to `/out`.
 * @param sourceDateEpochSeconds - Override for the fixed epoch that seeds the
 *   neutralized dates; defaults to {@link DEFAULT_SOURCE_DATE_EPOCH_SECONDS}.
 */
export const normalizePdfBytes = (
  pdfBytes: Uint8Array,
  sourceDateEpochSeconds: number = DEFAULT_SOURCE_DATE_EPOCH_SECONDS,
): Uint8Array => {
  const fixedDate = formatPdfDate(sourceDateEpochSeconds);
  const fixedIdArray = `<${FIXED_DOCUMENT_ID_HEX}><${FIXED_DOCUMENT_ID_HEX}>`;

  const normalizedText = bytesToBinaryString(pdfBytes)
    .replaceAll(CREATION_DATE_PATTERN, (_match, open: string, _contents: string, close: string) =>
      `${open}${fixedDate}${close}`,
    )
    .replaceAll(MOD_DATE_PATTERN, (_match, open: string, _contents: string, close: string) =>
      `${open}${fixedDate}${close}`,
    )
    .replaceAll(DOCUMENT_ID_PATTERN, (_match, open: string, _contents: string, close: string) =>
      `${open}${fixedIdArray}${close}`,
    );

  return binaryStringToBytes(normalizedText);
};
