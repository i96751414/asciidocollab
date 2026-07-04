/**
 * New-name validation for symbol renames now lives in the zero-dep `@asciidocollab/asciidoc-core`
 * so the server and the in-editor rename pre-flight share ONE rule and cannot drift. This module
 * re-exports it to preserve the existing domain import paths.
 */
export { isValidNewName, type RenamableSymbolKind } from '@asciidocollab/asciidoc-core';
