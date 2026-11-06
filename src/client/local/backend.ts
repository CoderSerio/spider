import type { LocalBackend } from './types.js';

let backend: LocalBackend | null = null;
export function useLocalBackend(value: LocalBackend): void {
  backend = value;
}
export async function localBackend(): Promise<LocalBackend> {
  // In the journal worker (or the existing no-Worker fallback), call directly.
  return backend ?? (await import('./runtime.js')).localRuntime;
}
