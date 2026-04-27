// Local-first photos live in IndexedDB, which browsers may evict under
// storage pressure unless the origin is marked "persistent". These helpers
// request persistence on first save and expose a usage/quota estimate for
// the Settings panel.

const PERSIST_TRIED_KEY = 'gainey-glow:persist-tried';

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    // Some browsers (Safari) silently deny without a prompt. Don't keep
    // re-asking on every photo save — try once per device.
    if (localStorage.getItem(PERSIST_TRIED_KEY)) return false;
    const granted = await navigator.storage.persist();
    localStorage.setItem(PERSIST_TRIED_KEY, '1');
    return granted;
  } catch {
    return false;
  }
}

export async function isStoragePersistent(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export interface StorageInfo {
  usage: number;
  quota: number;
  persistent: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return {
      usage: e.usage ?? 0,
      quota: e.quota ?? 0,
      persistent: await isStoragePersistent(),
    };
  } catch {
    return null;
  }
}
