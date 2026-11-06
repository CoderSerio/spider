import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  reload: vi.fn(),
  unload: vi.fn(),
  create: vi.fn(),
  interrupt: vi.fn(),
}));
vi.mock('@mlc-ai/web-llm', () => ({
  MLCEngine: class {
    constructor(options: { initProgressCallback: (report: { text: string }) => void }) {
      options.initProgressCallback({ text: 'download 50%' });
    }
    reload = mock.reload;
    unload = mock.unload;
    interruptGenerate = mock.interrupt;
    chat = { completions: { create: mock.create } };
  },
}));
import { createLocalRuntime } from '../../../src/client/local/runtime.js';
const reply = {
  choices: [{ message: { content: '<think>hidden</think> done' } }],
  usage: { prompt_tokens: 5, completion_tokens: 2 },
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.create.mockResolvedValue(reply);
});
it('loads once, shares the model, strips reasoning and releases GPU memory without deleting caches', async () => {
  const runtime = createLocalRuntime();
  expect((await runtime.localStatus()).ready).toBe(false);
  await runtime.localUnload();
  await expect(runtime.localComplete('unloaded', [])).rejects.toThrow('请先');
  await Promise.all([runtime.localLoad(), runtime.localLoad()]);
  expect(mock.reload).toHaveBeenCalledTimes(1);
  expect((await runtime.localStatus()).ready).toBe(true);
  expect(await runtime.localComplete('one', [])).toEqual({ text: 'done', input: 5, output: 2 });
  mock.create.mockResolvedValueOnce({ ...reply, choices: [{ message: { content: null } }] });
  expect((await runtime.localComplete('empty', [])).text).toBe('');
  await runtime.localUnload();
  expect(mock.unload).toHaveBeenCalledTimes(1);
  expect((await runtime.localStatus()).ready).toBe(false);
});
it('reports progress and can retry after a failed download', async () => {
  const runtime = createLocalRuntime();
  let finish!: () => void;
  mock.reload.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const loading = runtime.localLoad();
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(await runtime.localStatus()).toEqual({ ready: false, text: 'download 50%' });
  finish();
  await loading;
  await runtime.localUnload();
  mock.reload.mockRejectedValueOnce(new Error('network'));
  await expect(runtime.localLoad()).rejects.toThrow('network');
  expect((await runtime.localStatus()).text).toContain('network');
  await runtime.localLoad();
  expect((await runtime.localStatus()).ready).toBe(true);
});
it('cancels a queued request without interrupting a different active generation', async () => {
  const runtime = createLocalRuntime();
  await runtime.localLoad();
  let finish!: (value: typeof reply) => void;
  mock.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const active = runtime.localComplete('active', []);
  await vi.waitFor(() => expect(finish).toBeDefined());
  const queued = runtime.localComplete('queued', []);
  const rejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
  await runtime.localCancel('queued');
  await runtime.localCancel('unknown');
  expect(mock.interrupt).not.toHaveBeenCalled();
  finish(reply);
  await active;
  await rejected;
  expect(mock.create).toHaveBeenCalledTimes(1);
});
it('interrupts the active request and rejects its partial answer', async () => {
  const runtime = createLocalRuntime();
  await runtime.localLoad();
  let finish!: (value: typeof reply) => void;
  mock.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const active = runtime.localComplete('active', []);
  const rejected = expect(active).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(finish).toBeDefined());
  await runtime.localCancel('active');
  expect(mock.interrupt).toHaveBeenCalledTimes(1);
  finish(reply);
  await rejected;
  expect((await runtime.localComplete('next', [])).text).toBe('done');
});
