/** Model credentials live in this browser only. Empty means hand driving. */

const STORAGE_KEY = 'p5-art.pilot';

export interface PilotSettings {
  baseURL: string;
  model: string;
  apiKey: string;
}

const EMPTY: PilotSettings = { baseURL: '', model: '', apiKey: '' };

export function readPilot(): PilotSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PilotSettings>;
    return {
      baseURL: typeof parsed.baseURL === 'string' ? parsed.baseURL : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writePilot(settings: PilotSettings): void {
  const next: PilotSettings = {
    baseURL: settings.baseURL.trim().replace(/\/+$/, ''),
    model: settings.model.trim(),
    apiKey: settings.apiKey.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** All three fields are required before the page will call a model. */
export function pilotReady(settings: PilotSettings): boolean {
  return settings.baseURL !== '' && settings.model !== '' && settings.apiKey !== '';
}
