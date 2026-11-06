import { localBackend } from './backend.js';
import { prepareOffline } from './offline.js';

export function bindLocalPanel(doc: Document): (local: boolean) => void {
  const panel = doc.querySelector<HTMLElement>('#local-model-panel')!;
  const load = doc.querySelector<HTMLButtonElement>('#local-load')!;
  const unload = doc.querySelector<HTMLButtonElement>('#local-unload')!;
  const status = doc.querySelector<HTMLElement>('#local-status')!;
  const offline = doc.querySelector<HTMLElement>('#offline-status')!;
  const report = async (): Promise<void> => {
    status.textContent = (await (await localBackend()).localStatus()).text;
  };
  load.addEventListener('click', () => {
    load.disabled = true;
    unload.disabled = true;
    status.textContent = '正在加载；优先使用缓存，缺失文件才会下载…';
    const timer = setInterval(() => {
      void report().catch(() => undefined);
    }, 500);
    void (async () => {
      if (!('gpu' in navigator))
        throw new Error('需要支持 WebGPU 的浏览器，请使用新版桌面 Chrome 或 Edge');
      await prepareOffline();
      offline.textContent = import.meta.env.DEV
        ? '开发模式：网页离线缓存仅在正式构建中启用'
        : '网页已缓存。模型加载成功后可断网重开；浏览器清理缓存后需要重新下载。';
      await (await localBackend()).localLoad();
      await report();
    })()
      .catch((error: unknown) => {
        status.textContent = String(error);
      })
      .finally(() => {
        clearInterval(timer);
        load.disabled = false;
        unload.disabled = false;
      });
  });
  unload.addEventListener('click', () => {
    unload.disabled = true;
    void (async () => {
      await (await localBackend()).localUnload();
      await report();
    })()
      .catch((error: unknown) => {
        status.textContent = String(error);
      })
      .finally(() => {
        unload.disabled = false;
      });
  });
  return (local) => {
    panel.hidden = !local;
    doc.querySelector<HTMLElement>('#online-model-panel')!.hidden = local;
    for (const input of doc.querySelectorAll<HTMLInputElement>(
      '#settings-form input:not([name="localModel"])',
    )) {
      input.disabled = local;
    }
  };
}
