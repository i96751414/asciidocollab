/**
 * A discriminated union representing the result of a fallible operation.
 * - `{ success: true; value: T }` indicates success with a value
 * - `{ success: false; error: E }` indicates failure with an error
 */
export type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E };
