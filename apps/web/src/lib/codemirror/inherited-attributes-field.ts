import { StateEffect, StateField, type EditorState } from '@codemirror/state';

/**
 * The open file's attributes inherited from the documents that include it — its ancestors along the
 * include path from the project main file.
 *
 * Held in editor state so any extension can read ONE source when it needs to seed `extractSymbols`,
 * rather than each carrying its own channel. Seeding matters because a heading's auto-generated id
 * reflects an `idprefix`/`idseparator`/`sectids` a PARENT set above the include, so a consumer that
 * scans the open buffer alone (rename detection, xref completion) would otherwise derive an
 * unprefixed id that diverges from the server (which seeds the same way) and the preview. The field
 * is installed by the base editor extensions and kept in sync by {@link setInheritedAttributesEffect};
 * its value is `undefined` before the first seed and an empty map when the file inherits nothing.
 */
export const setInheritedAttributesEffect = StateEffect.define<ReadonlyMap<string, string>>();

/** Editor-state holder for {@link setInheritedAttributesEffect}; see the effect's docs. */
export const inheritedAttributesField = StateField.define<ReadonlyMap<string, string> | undefined>({
  create: () => undefined,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setInheritedAttributesEffect)) return effect.value;
    return value;
  },
});

/**
 * The open file's inherited-attribute seed from editor state.
 *
 * @param state - The current editor state.
 * @returns The inherited-attribute map, or undefined when the field is not installed / not yet seeded.
 */
export function inheritedAttributesSeed(state: EditorState): ReadonlyMap<string, string> | undefined {
  return state.field(inheritedAttributesField, false);
}
