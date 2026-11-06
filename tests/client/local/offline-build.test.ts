// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { offlinePlugin, offlineWorkerSource } from '../../../build/offline.js';

it('pre-caches built assets and serves only the application while offline', async () => {
  // Exercise the emitted service-worker source, including nested deployment scope.
  const source = offlineWorkerSource(['index.html', 'assets/journal.worker.js'], 'test');
  const handlers: Record<string, (event: any) => void> = {};
  const cache = { addAll: vi.fn(async () => {}), match: vi.fn(async () => 'cached') };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['spider-offline-old', 'webllm/model']),
    delete: vi.fn(async () => true),
  };
  const fetch = vi.fn(async () => 'network');
  runInNewContext(source, {
    URL,
    caches,
    fetch,
    self: {
      registration: { scope: 'https://example.com/spider/' },
      addEventListener: (name: string, handler: any) => {
        handlers[name] = handler;
      },
    },
  });
  let work!: Promise<unknown>;
  const waitUntil = (promise: Promise<unknown>) => {
    work = promise;
  };
  handlers.install({ waitUntil });
  await work;
  expect(cache.addAll.mock.calls[0][0]).toContain('https://example.com/spider/index.html');
  expect(cache.addAll.mock.calls[0][0].some((url: string) => url.includes('journal.worker'))).toBe(
    true,
  );
  handlers.activate({ waitUntil });
  await work;
  expect(caches.delete.mock.calls).toEqual([['spider-offline-old']]);
  const respondWith = vi.fn();
  handlers.fetch({
    request: { method: 'GET', url: 'https://example.com/spider/', mode: 'navigate' },
    respondWith,
  });
  expect(await respondWith.mock.calls[0][0]).toBe('cached');
  cache.match.mockResolvedValueOnce(undefined as never);
  handlers.fetch({
    request: { method: 'GET', url: 'https://example.com/spider/index.html', mode: 'same-origin' },
    respondWith,
  });
  expect(await respondWith.mock.calls[1][0]).toBe('network');
  handlers.fetch({ request: { method: 'POST', url: 'https://example.com/spider/' }, respondWith });
  handlers.fetch({ request: { method: 'GET', url: 'https://api.example.com/v1' }, respondWith });
  handlers.fetch({ request: { method: 'GET', url: 'https://example.com/private' }, respondWith });
  expect(respondWith).toHaveBeenCalledTimes(2);
  expect(offlinePlugin().apply).toBe('build');
});
