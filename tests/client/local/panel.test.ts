import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildChrome } from '../../../src/client/panel/chrome.js';
import { bindLocalPanel } from '../../../src/client/local/panel.js';
const mock = vi.hoisted(() => ({
  load: vi.fn(),
  status: vi.fn(),
  unload: vi.fn(),
  offline: vi.fn(),
}));
vi.mock('../../../src/client/local/backend.js', () => ({
  localBackend: async () => ({
    localLoad: mock.load,
    localStatus: mock.status,
    localUnload: mock.unload,
  }),
}));
vi.mock('../../../src/client/local/offline.js', () => ({ prepareOffline: mock.offline }));
const button = (id: string) => document.querySelector<HTMLButtonElement>(id)!;
const status = () => document.querySelector('#local-status')!.textContent;
beforeEach(() => {
  vi.resetAllMocks();
  mock.offline.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { gpu: {} });
  document.body.replaceChildren(buildChrome(document));
  mock.status.mockResolvedValue({ text: 'ready', ready: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('disables cloud fields only for local mode and downloads only after a click', async () => {
  const reflect = bindLocalPanel(document);
  reflect(true);
  expect(document.querySelector<HTMLElement>('#online-model-panel')!.hidden).toBe(true);
  expect(document.querySelector<HTMLInputElement>('[name="apiKey"]')!.disabled).toBe(true);
  expect(mock.load).not.toHaveBeenCalled();
  button('#local-load').click();
  await vi.waitFor(() => expect(status()).toBe('ready'));
  expect(document.querySelector('#offline-status')!.textContent).toContain('开发模式');
  expect(button('#local-load').disabled).toBe(false);
  button('#local-unload').click();
  await vi.waitFor(() => expect(button('#local-unload').disabled).toBe(false));
  expect(mock.unload).toHaveBeenCalledOnce();
  reflect(false);
  expect(document.querySelector<HTMLElement>('#online-model-panel')!.hidden).toBe(false);
  expect(document.querySelector<HTMLElement>('#local-model-panel')!.hidden).toBe(true);
  expect(document.querySelector<HTMLInputElement>('[name="apiKey"]')!.disabled).toBe(false);
});
it('shows progress during loading and leaves retry available after failure', async () => {
  vi.stubEnv('DEV', false);
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  mock.load.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  bindLocalPanel(document)(true);
  button('#local-load').click();
  await vi.advanceTimersByTimeAsync(500);
  expect(status()).toBe('ready');
  expect(document.querySelector('#offline-status')!.textContent).toContain('网页已缓存');
  mock.status.mockRejectedValueOnce(new Error('closed'));
  await vi.advanceTimersByTimeAsync(500);
  reject(new Error('download failed'));
  await vi.advanceTimersByTimeAsync(0);
  expect(status()).toContain('download failed');
  expect(button('#local-load').disabled).toBe(false);
  mock.unload.mockRejectedValueOnce(new Error('unload failed'));
  button('#local-unload').click();
  await vi.advanceTimersByTimeAsync(0);
  expect(status()).toContain('unload failed');
  expect(button('#local-unload').disabled).toBe(false);
});
it('explains missing WebGPU before downloading anything', async () => {
  vi.stubGlobal('navigator', {});
  bindLocalPanel(document)(true);
  button('#local-load').click();
  await vi.waitFor(() => expect(status()).toContain('WebGPU'));
  expect(mock.load).not.toHaveBeenCalled();
  expect(mock.offline).not.toHaveBeenCalled();
});

it('loads the model even when page caching fails, without claiming offline readiness', async () => {
  mock.offline.mockRejectedValueOnce(new Error('storage unavailable'));
  bindLocalPanel(document)(true);
  button('#local-load').click();
  await vi.waitFor(() => expect(status()).toBe('ready'));
  expect(mock.load).toHaveBeenCalledOnce();
  expect(document.querySelector('#offline-status')!.textContent).toContain('暂不支持断网重开');
});

it.each(['resolve', 'reject'] as const)(
  'does not wait on caching or let a stale %s overwrite a newer attempt',
  async (outcome) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    mock.offline.mockImplementationOnce(
      () =>
        new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    bindLocalPanel(document)(true);
    button('#local-load').click();
    await vi.waitFor(() => expect(status()).toBe('ready'));
    expect(document.querySelector('#offline-status')!.textContent).toContain('正在准备');
    button('#local-load').click();
    await vi.waitFor(() => expect(mock.load).toHaveBeenCalledTimes(2));
    const latest = document.querySelector('#offline-status')!.textContent;
    if (outcome === 'resolve') resolve();
    else reject(new Error('old attempt'));
    await Promise.resolve();
    expect(document.querySelector('#offline-status')!.textContent).toBe(latest);
  },
);
