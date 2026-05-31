// T002: Failing tests for useTouchedFields — touch, touchAll, isTouched behaviour
import { renderHook, act } from '@testing-library/react';
import { useTouchedFields } from '@/hooks/use-touched-fields';

const ALL_FIELDS = ['name', 'email', 'password'] as const;

describe('useTouchedFields', () => {
  test('isTouched returns false for untouched fields', () => {
    const { result } = renderHook(() => useTouchedFields(ALL_FIELDS));
    expect(result.current.isTouched('name')).toBe(false);
    expect(result.current.isTouched('email')).toBe(false);
  });

  test('touch marks a single field as touched', () => {
    const { result } = renderHook(() => useTouchedFields(ALL_FIELDS));
    act(() => { result.current.touch('name'); });
    expect(result.current.isTouched('name')).toBe(true);
    expect(result.current.isTouched('email')).toBe(false);
  });

  test('touchAll marks all fields as touched', () => {
    const { result } = renderHook(() => useTouchedFields(ALL_FIELDS));
    act(() => { result.current.touchAll(); });
    for (const field of ALL_FIELDS) {
      expect(result.current.isTouched(field)).toBe(true);
    }
  });

  test('touch is idempotent', () => {
    const { result } = renderHook(() => useTouchedFields(ALL_FIELDS));
    act(() => {
      result.current.touch('email');
      result.current.touch('email');
    });
    expect(result.current.isTouched('email')).toBe(true);
  });

  test('touching one field does not affect others', () => {
    const { result } = renderHook(() => useTouchedFields(ALL_FIELDS));
    act(() => { result.current.touch('password'); });
    expect(result.current.isTouched('name')).toBe(false);
    expect(result.current.isTouched('email')).toBe(false);
    expect(result.current.isTouched('password')).toBe(true);
  });
});
