// Tiny settings layer over localStorage. Sensitive values (API keys) live
// only in the browser and never go to any server we control.

const KEY_GEMINI = 'gainey-glow:gemini-api-key';
const KEY_MODEL = 'gainey-glow:gemini-model';

export function getGeminiKey(): string {
  return localStorage.getItem(KEY_GEMINI) ?? '';
}
export function setGeminiKey(v: string): void {
  if (v) localStorage.setItem(KEY_GEMINI, v);
  else localStorage.removeItem(KEY_GEMINI);
}

export function getGeminiModel(): string {
  return localStorage.getItem(KEY_MODEL) || 'gemini-2.5-flash';
}
export function setGeminiModel(v: string): void {
  if (v) localStorage.setItem(KEY_MODEL, v);
  else localStorage.removeItem(KEY_MODEL);
}
