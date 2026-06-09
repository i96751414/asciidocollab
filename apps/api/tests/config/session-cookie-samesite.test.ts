import { createConfig } from '../../src/config/schema';

// T056 / SEC2: defence-in-depth against cross-site WebSocket hijacking — the
// session cookie must be issued with SameSite=Lax or stricter so the browser does
// not attach it to cross-site WebSocket handshakes by default.
describe('session cookie SameSite', () => {
  it('defaults to "strict" (>= Lax)', () => {
    const config = createConfig();
    const sameSite = config.default('auth.session.cookie.sameSite');
    expect(['strict', 'lax']).toContain(sameSite);
  });

  it('only permits strict | lax | none (no arbitrary values)', () => {
    const config = createConfig();
    const schema = config.getSchema();
    // Walk to the sameSite node and assert its allowed format.
    const node = schema._cvtProperties.auth._cvtProperties.session._cvtProperties.cookie._cvtProperties.sameSite;
    expect(node.format).toEqual(['strict', 'lax', 'none']);
  });
});
