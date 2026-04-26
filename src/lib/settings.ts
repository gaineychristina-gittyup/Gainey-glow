// Tiny settings layer over localStorage. Sensitive values (API keys) live
// only in the browser and never go to any server we control.

import { useEffect, useState } from 'react';

const KEY_GEMINI = 'gainey-glow:gemini-api-key';
const KEY_MODEL = 'gainey-glow:gemini-model';
const SETTINGS_EVENT = 'gainey-glow:settings-changed';

export function getGeminiKey(): string {
  return localStorage.getItem(KEY_GEMINI) ?? '';
}
export function setGeminiKey(v: string): void {
  if (v) localStorage.setItem(KEY_GEMINI, v);
  else localStorage.removeItem(KEY_GEMINI);
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
}

export function getGeminiModel(): string {
  return localStorage.getItem(KEY_MODEL) || 'gemini-2.5-flash';
}
export function setGeminiModel(v: string): void {
  if (v) localStorage.setItem(KEY_MODEL, v);
  else localStorage.removeItem(KEY_MODEL);
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
}

// React hook that re-renders whenever the key changes from anywhere
// (including other tabs).
export function useGeminiKey(): string {
  const [key, setKey] = useState(getGeminiKey);
  useEffect(() => {
    const update = () => setKey(getGeminiKey());
    window.addEventListener(SETTINGS_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return key;
}
