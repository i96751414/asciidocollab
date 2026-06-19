import {
  parseConditional,
  evaluateConditional,
  conditionalLineKind,
  ConditionalRegionStack,
} from '../src/conditional-regions';

const scope = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('parseConditional', () => {
  test('parses a single-attribute ifdef', () => {
    expect(parseConditional('ifdef::draft[]')).toEqual({ kind: 'ifdef', attrs: ['draft'], expr: null });
  });

  test('downcases attribute names', () => {
    expect(parseConditional('ifdef::Draft[]')).toEqual({ kind: 'ifdef', attrs: ['draft'], expr: null });
  });

  test('parses an OR list (comma) and an AND list (plus)', () => {
    expect(parseConditional('ifdef::a,b[]')).toEqual({ kind: 'ifdef', attrs: ['a', 'b'], op: 'or', expr: null });
    expect(parseConditional('ifdef::a+b[]')).toEqual({ kind: 'ifdef', attrs: ['a', 'b'], op: 'and', expr: null });
  });

  test('comma binds before plus (a+b,c splits on the comma into [a+b] OR [c])', () => {
    // Split is on the chosen separator only; `a+b` stays one token that never matches a real
    // attribute name (names cannot contain `+`), which is the Asciidoctor outcome.
    expect(parseConditional('ifdef::a+b,c[]')).toEqual({ kind: 'ifdef', attrs: ['a+b', 'c'], op: 'or', expr: null });
  });

  test('parses ifndef', () => {
    expect(parseConditional('ifndef::draft[]')).toEqual({ kind: 'ifndef', attrs: ['draft'], expr: null });
  });

  test('parses an ifeval comparison', () => {
    expect(parseConditional('ifeval::[{v} >= 2]')).toEqual({
      kind: 'ifeval',
      attrs: [],
      expr: { lhs: '{v}', op: '>=', rhs: '2' },
    });
  });

  test('returns null for an ifeval with no comparison operator', () => {
    expect(parseConditional('ifeval::[justtext]')).toBeNull();
  });

  test('returns null for a non-directive line and for endif', () => {
    expect(parseConditional('regular text')).toBeNull();
    expect(parseConditional('endif::[]')).toBeNull();
  });
});

describe('evaluateConditional', () => {
  test('ifdef is true when the attribute is defined (even empty value)', () => {
    expect(evaluateConditional(parseConditional('ifdef::d[]')!, scope({ d: '' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifdef::d[]')!, scope({}))).toBe(false);
  });

  test('ifndef negates presence', () => {
    expect(evaluateConditional(parseConditional('ifndef::d[]')!, scope({}))).toBe(true);
    expect(evaluateConditional(parseConditional('ifndef::d[]')!, scope({ d: 'x' }))).toBe(false);
  });

  test('AND requires every attribute; OR requires any', () => {
    expect(evaluateConditional(parseConditional('ifdef::a+b[]')!, scope({ a: '', b: '' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifdef::a+b[]')!, scope({ a: '' }))).toBe(false);
    expect(evaluateConditional(parseConditional('ifdef::a,b[]')!, scope({ b: '' }))).toBe(true);
  });

  test('ifeval compares numerically when both operands are numeric', () => {
    expect(evaluateConditional(parseConditional('ifeval::[{v} > 1]')!, scope({ v: '3' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifeval::[{v} <= 2]')!, scope({ v: '3' }))).toBe(false);
    expect(evaluateConditional(parseConditional('ifeval::[{v} >= 3]')!, scope({ v: '3' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifeval::[{v} < 9]')!, scope({ v: '3' }))).toBe(true);
  });

  test('ifeval equality keeps quoted strings distinct from numbers', () => {
    expect(evaluateConditional(parseConditional('ifeval::["2" == 2]')!, scope({}))).toBe(false);
    expect(evaluateConditional(parseConditional('ifeval::[2 == 2]')!, scope({}))).toBe(true);
    expect(evaluateConditional(parseConditional('ifeval::[2 != 3]')!, scope({}))).toBe(true);
  });

  test('ifeval ordering with a non-numeric operand compares as strings', () => {
    expect(evaluateConditional(parseConditional('ifeval::[{x} < beta]')!, scope({ x: '3' }))).toBe(true); // "3" < "beta"
  });

  test('ifeval with an unknown operator is false', () => {
    expect(evaluateConditional({ kind: 'ifeval', attrs: [], expr: { lhs: '1', op: '<<', rhs: '2' } }, scope({}))).toBe(false);
  });
});

describe('conditionalLineKind', () => {
  test('classifies endif, region openers, and other lines', () => {
    expect(conditionalLineKind('endif::[]')).toBe('endif');
    expect(conditionalLineKind('ifdef::draft[]')).toBe('opener');
    expect(conditionalLineKind('ifeval::[{v} > 1]')).toBe('opener');
    expect(conditionalLineKind('plain text')).toBeNull();
  });

  test('the single-line content form ifdef::name[text] is NOT a region opener', () => {
    expect(conditionalLineKind('ifdef::draft[Only in draft]')).toBeNull();
  });
});

describe('ConditionalRegionStack', () => {
  test('is active at top level', () => {
    expect(new ConditionalRegionStack().isActive()).toBe(true);
  });

  test('an active opener keeps content active; an inactive one gates it off', () => {
    const stack = new ConditionalRegionStack();
    stack.applyLine('ifdef::draft[]', scope({ draft: '' }));
    expect(stack.isActive()).toBe(true);
    stack.applyLine('endif::[]', scope({}));
    expect(stack.isActive()).toBe(true);

    stack.applyLine('ifdef::draft[]', scope({}));
    expect(stack.isActive()).toBe(false);
  });

  test('a single inactive ancestor gates a nested active region off', () => {
    const stack = new ConditionalRegionStack();
    stack.open('ifdef::off[]', scope({})); // inactive
    stack.open('ifdef::on[]', scope({ on: '' })); // would be active, but ancestor is off
    expect(stack.isActive()).toBe(false);
    stack.close();
    expect(stack.isActive()).toBe(false);
  });

  test('an empty/unparseable opener still balances its endif (pushes an inactive frame)', () => {
    const stack = new ConditionalRegionStack();
    stack.applyLine('ifeval::[]', scope({}));
    expect(stack.isActive()).toBe(false);
    stack.applyLine('endif::[]', scope({}));
    expect(stack.isActive()).toBe(true);
  });

  test('a stray endif on an empty stack is a no-op', () => {
    const stack = new ConditionalRegionStack();
    stack.close();
    expect(stack.isActive()).toBe(true);
  });

  test('applyLine returns the line kind', () => {
    const stack = new ConditionalRegionStack();
    expect(stack.applyLine('ifdef::d[]', scope({ d: '' }))).toBe('opener');
    expect(stack.applyLine('body', scope({}))).toBeNull();
    expect(stack.applyLine('endif::[]', scope({}))).toBe('endif');
  });
});
