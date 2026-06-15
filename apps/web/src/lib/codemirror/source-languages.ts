import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

/**
 * Curated allow-list of source languages we highlight inside `[source,<lang>]`
 * blocks (US5/FR-017). Keys are the lowercased language tokens that may appear
 * in an AsciiDoc source declaration (including common aliases); values are the
 * canonical `@codemirror/language-data` language names.
 *
 * Scoped deliberately (~20 entries / ~15 distinct languages) rather than
 * exposing every CodeMirror language pack — keeps the lazy-loaded bundle small
 * and the highlighting predictable (research R1).
 */
const ALLOWLIST: Readonly<Record<string, string>> = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  node: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  python: 'Python',
  py: 'Python',
  java: 'Java',
  c: 'C',
  'c++': 'C++',
  cpp: 'C++',
  'c#': 'C#',
  csharp: 'C#',
  cs: 'C#',
  go: 'Go',
  golang: 'Go',
  rust: 'Rust',
  rs: 'Rust',
  ruby: 'Ruby',
  rb: 'Ruby',
  php: 'PHP',
  shell: 'Shell',
  sh: 'Shell',
  bash: 'Shell',
  console: 'Shell',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  md: 'Markdown',
};

/**
 * Resolve a `[source,<lang>]` token to its canonical `@codemirror/language-data`
 * language name, or `null` when the language is not in the curated allow-list.
 * Pure — does not touch `@codemirror/language-data` (safe to unit-test in isolation).
 */
export function canonicalSourceLanguageName(name: string | null | undefined): string | null {
  if (!name) return null;
  return ALLOWLIST[name.trim().toLowerCase()] ?? null;
}

/** Distinct AsciiDoc source-language tokens offered for completion (FR-031), sorted. */
export function listSourceLanguageTokens(): string[] {
  return Object.keys(ALLOWLIST).toSorted();
}

/**
 * Resolve a `[source,<lang>]` token to a CodeMirror {@link LanguageDescription}
 * (whose `load()` lazily imports the language pack), or `null` when unknown
 * or unsupported by `@codemirror/language-data`.
 */
export function resolveSourceLanguage(name: string | null | undefined): LanguageDescription | null {
  const canonical = canonicalSourceLanguageName(name);
  if (!canonical) return null;
  return languages.find((language) => language.name === canonical) ?? null;
}
