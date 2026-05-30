import { isInternalPath } from '@/lib/redirect';

describe('isInternalPath', () => {
  test("'/' is internal", () => {
    expect(isInternalPath('/')).toBe(true);
  });

  test("'/dashboard' is internal", () => {
    expect(isInternalPath('/dashboard')).toBe(true);
  });

  test("'/dashboard/projects/new' is internal", () => {
    expect(isInternalPath('/dashboard/projects/new')).toBe(true);
  });

  test("'https://evil.com' is not internal", () => {
    expect(isInternalPath('https://evil.com')).toBe(false);
  });

  test("'//evil.com' is not internal (protocol-relative)", () => {
    expect(isInternalPath('//evil.com')).toBe(false);
  });

  test("empty string is not internal", () => {
    expect(isInternalPath('')).toBe(false);
  });

  test("'relative' without leading slash is not internal", () => {
    expect(isInternalPath('relative')).toBe(false);
  });
});
