import { Result } from '../../src/types/result';

describe('Result type', () => {
  test('success variant has value and success=true', () => {
    const result: Result<number, string> = { success: true, value: 42 };
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(42);
    }
  });

  test('failure variant has error and success=false', () => {
    const result: Result<number, string> = { success: false, error: 'Something went wrong' };
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Something went wrong');
    }
  });

  test('success with string value', () => {
    const result: Result<string, Error> = { success: true, value: 'ok' };
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('ok');
    }
  });

  test('failure with Error instance', () => {
    const error = new Error('fail');
    const result: Result<number, Error> = { success: false, error };
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('fail');
    }
  });
});
