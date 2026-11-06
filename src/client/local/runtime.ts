import type { MLCEngine } from '@mlc-ai/web-llm';
import { LOCAL_MODEL, type LocalBackend, type LocalStatus } from './types.js';

/** One engine in the journal worker, shared by actions and diary summaries. */
export function createLocalRuntime(): LocalBackend {
  let engine: MLCEngine | null = null;
  let status: LocalStatus = { ready: false, text: '尚未加载本机模型' };
  let queue = Promise.resolve();
  let active: string | null = null;
  const pending = new Set<string>();
  const cancelled = new Set<string>();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const task = queue.then(work);
    queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
  return {
    localStatus: async () => ({ ...status }),
    localLoad: () =>
      serial(async () => {
        if (engine) return;
        status = { ready: false, text: '正在加载本机模型…' };
        const { MLCEngine } = await import('@mlc-ai/web-llm');
        const next = new MLCEngine({
          initProgressCallback: (report) => {
            status = { ready: false, text: report.text };
          },
        });
        try {
          await next.reload(LOCAL_MODEL, { context_window_size: 4096 });
          engine = next;
          status = { ready: true, text: '本机模型已就绪' };
        } catch (error) {
          await next.unload();
          status = { ready: false, text: `加载失败：${String(error)}` };
          throw error;
        }
      }),
    localComplete(id, messages) {
      pending.add(id);
      return serial(async () => {
        try {
          if (cancelled.has(id)) throw new DOMException('已停止', 'AbortError');
          if (!engine) throw new Error('请先在设置里加载本机模型');
          active = id;
          const result = await engine.chat.completions.create({
            messages,
            temperature: 0,
            max_tokens: 384,
            extra_body: { enable_thinking: false },
          });
          if (cancelled.has(id)) throw new DOMException('已停止', 'AbortError');
          return {
            text: (result.choices[0].message.content ?? '')
              .replace(/<think>[\s\S]*?<\/think>/g, '')
              .trim(),
            input: result.usage!.prompt_tokens,
            output: result.usage!.completion_tokens,
          };
        } finally {
          active = null;
          pending.delete(id);
          cancelled.delete(id);
        }
      });
    },
    async localCancel(id) {
      if (!pending.has(id)) return;
      cancelled.add(id);
      if (active === id) await engine!.interruptGenerate();
    },
    localUnload: () =>
      serial(async () => {
        await engine?.unload();
        engine = null;
        status = { ready: false, text: '已释放模型显存，下载缓存仍保留' };
      }),
  };
}
export const localRuntime = createLocalRuntime();
