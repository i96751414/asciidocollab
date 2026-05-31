'use client';

import { useState } from 'react';

/** Tracks which form fields have been interacted with (blurred or submitted). */
export function useTouchedFields<T extends string>(allFields: readonly T[]) {
  const [touched, setTouched] = useState<Partial<Record<T, boolean>>>({});

  /** Marks a single field as touched. */
  function touch(field: T) {
    setTouched((previous) => ({ ...previous, [field]: true }));
  }

  /** Marks all fields as touched (called on form submit). */
  function touchAll() {
    const all: Partial<Record<T, boolean>> = {};
    for (const field of allFields) {
      all[field] = true;
    }
    setTouched(all);
  }

  /** Returns true if the given field has been touched. */
  function isTouched(field: T): boolean {
    return touched[field] === true;
  }

  return { touch, touchAll, isTouched };
}
