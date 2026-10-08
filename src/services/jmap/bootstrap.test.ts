import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({ token: 'test-login-a', fetch: vi.fn() }));
vi.mock('@/services/api', () => ({ apiFetch: fixtures.fetch }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => ({ accessToken: fixtures.token }) } }));
import { fetchAdministrationBootstrap } from './client';
function pending() {
  const resolvers: (() => void)[] = [];
  fixtures.fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push(() => resolve({ json: async () => ({}) }));
      }),
  );
  return () => resolvers.forEach((resolve) => resolve());
}
describe('administration startup requests', () => {
  beforeEach(() => {
    fixtures.fetch.mockReset();
    fixtures.token = 'test-login-a';
  });
  it('starts all independent requests immediately and shares only in-flight work', async () => {
    const finish = pending();
    const first = fetchAdministrationBootstrap();
    expect(fixtures.fetch.mock.calls.map((call) => call[0])).toEqual(['/jmap/session', '/api/schema', '/api/account']);
    expect(fetchAdministrationBootstrap()).toBe(first);
    finish();
    await first;
    const next = fetchAdministrationBootstrap();
    expect(next).not.toBe(first);
    expect(fixtures.fetch).toHaveBeenCalledTimes(6);
    finish();
    await next;
  });
  it('does not share account data between different logins', async () => {
    const finish = pending();
    const first = fetchAdministrationBootstrap();
    fixtures.token = 'test-login-b';
    const second = fetchAdministrationBootstrap();
    expect(second).not.toBe(first);
    expect(fixtures.fetch).toHaveBeenCalledTimes(6);
    finish();
    await Promise.all([first, second]);
  });
  it('clears failed requests so retries can succeed', async () => {
    fixtures.fetch
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValue({ json: async () => ({}) });
    await expect(fetchAdministrationBootstrap()).rejects.toThrow('temporary network failure');
    await expect(fetchAdministrationBootstrap()).resolves.toHaveLength(3);
  });
});
